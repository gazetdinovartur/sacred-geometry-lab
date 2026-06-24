import Alpine from 'alpinejs';
import { AudioEngine } from '../audio/AudioEngine';
import { EqLabRenderer, downsampleBars, EQ_BAND_COUNT } from '../geometry/EqLabRenderer';
import type { LabRenderer } from '../geometry/LabRenderer';
import { AudioSessionLoop } from '../modes/AudioSessionLoop';
import { ProcessMode } from '../modes/ProcessMode';
import { GeometryPipeline, SILENCE_RMS } from '../geometry/GeometryPipeline';
import type { AudioFrame } from '../modes/AudioSessionLoop';
import { formatSilenceLabel } from '../geometry/SilenceMapper';
import { downloadPng, downloadSvg } from '../export/exportFiles';
import { exportMandalaPng, exportMandalaSvg } from '../export/mandalaExport';
import { validateExportReadiness } from '../export/exportValidation';
import { VoiceProfile, type NormalizedFeatures } from '../audio/VoiceProfile';
import { CalibrationRunner } from './CalibrationRunner';
import { PitchContour } from '../geometry/PitchContour';
import { motifLabel } from '../geometry/MotifPicker';
import { symmetryLabel } from '../geometry/SymmetryResolver';
import { exportSessionFrames } from '../export/exportFrames';
import type { FeatureSnapshot, GeometryStyle, LabMode, TimelineEntry } from '../types';

const WARMUP_MS = 900;
const STATUS_FLASH_MS = 1800;

type LabStore = {
  onLabPage: boolean;
  mode: LabMode;
  geometryStyle: GeometryStyle;
  isActive: boolean;
  isPaused: boolean;
  isStarting: boolean;
  isFullscreen: boolean;
  isCalibrating: boolean;
  calibrationProgress: number;
  calibrationPrompt: string;
  hasSession: boolean;
  status: string;
  rms: number;
  rmsNorm: number;
  frequencyLabel: string;
  symmetry: string;
  silenceLabel: string;
  activeMotif: string;
  timeline: TimelineEntry[];
  activeSnapshot: number | null;
  primaryLabel: () => string;
  setMode: (mode: LabMode) => void;
  setGeometryStyle: (style: GeometryStyle) => void;
  primaryAction: () => Promise<void>;
  pause: () => Promise<void>;
  stop: () => void;
  exportSvg: () => void;
  exportPng: () => void;
  exportFrames: () => Promise<void>;
  savePattern: () => Promise<void>;
  selectSnapshot: (index: number) => void;
  showLive: () => void;
  toggleFullscreen: () => Promise<void>;
  skipCalibration: () => void;
  recalibrate: () => Promise<void>;
};

export class LabApp {
  private audio = new AudioEngine();
  private renderer: LabRenderer | null = null;
  private sessionLoop: AudioSessionLoop | null = null;
  private processMode: ProcessMode | null = null;
  private voiceProfile = new VoiceProfile();
  private calibration = new CalibrationRunner(this.voiceProfile);
  private pitchContour = new PitchContour();
  private lastSnapshot: FeatureSnapshot | null = null;
  private frozenIndex: number | null = null;
  private workspaceEl: HTMLElement | null = null;
  private geometryPipeline = new GeometryPipeline();
  private warmUpUntil = 0;
  private statusTimer = 0;
  private lastMotifFlash = 0;
  private sessionStarted = 0;
  private voiceAccumMs = 0;
  private lastFrameTs = 0;
  private devPanelEl: HTMLElement | null = null;
  private readonly devMode = new URLSearchParams(window.location.search).get('dev') === '1';

  private readonly storeRef: LabStore = {
    onLabPage: false,
    mode: 'live',
    geometryStyle: 'flower',
    isActive: false,
    isPaused: false,
    isStarting: false,
    isFullscreen: false,
    isCalibrating: false,
    calibrationProgress: 0,
    calibrationPrompt: '',
    hasSession: false,
    status: '',
    rms: 0,
    rmsNorm: 0,
    frequencyLabel: '—',
    symmetry: '6',
    silenceLabel: '—',
    activeMotif: '—',
    timeline: [],
    activeSnapshot: null,

    primaryLabel: () => this.primaryLabel(),
    setMode: (mode) => this.setMode(mode),
    setGeometryStyle: (style) => this.setGeometryStyle(style),
    primaryAction: () => this.primaryAction(),
    pause: () => this.pause(),
    stop: () => this.stop(),
    exportSvg: () => this.exportSvg(),
    exportPng: () => this.exportPng(),
    exportFrames: () => this.exportFrames(),
    savePattern: () => this.savePattern(),
    selectSnapshot: (index) => this.selectSnapshot(index),
    showLive: () => this.showLive(),
    toggleFullscreen: () => this.toggleFullscreen(),
    skipCalibration: () => this.skipCalibration(),
    recalibrate: () => this.recalibrate(),
  };

  /** Через Alpine proxy — иначе UI не реагирует на смену mode и др. */
  get store(): LabStore {
    return (Alpine.store('lab') as LabStore | undefined) ?? this.storeRef;
  }

  init(canvas: HTMLCanvasElement): void {
    Alpine.store('lab', this.storeRef);
    this.store.onLabPage = true;

    this.renderer = new EqLabRenderer(canvas);
    this.renderer.setStyle(this.store.geometryStyle);
    this.renderer.resize();
    this.sessionLoop = new AudioSessionLoop((frame) => this.onAudioFrame(frame));
    this.processMode = new ProcessMode(this.renderer);
    this.workspaceEl = document.querySelector('.lab__workspace');

    requestAnimationFrame(() => {
      this.renderer?.resize();
      this.refreshCanvas();
    });

    window.addEventListener('resize', () => this.refreshCanvas());
    document.addEventListener('sgl-theme-change', () => {
      this.renderer?.refreshTheme?.();
      this.refreshCanvas();
    });
    document.addEventListener('fullscreenchange', () => {
      this.store.isFullscreen = document.fullscreenElement === this.workspaceEl;
      this.refreshCanvas();
    });

    if (this.devMode) {
      this.mountDevPanel();
    }
  }

  private primaryLabel(): string {
    if (this.store.mode === 'process' && (this.store.hasSession || this.store.isActive)) {
      return 'Начать сначала';
    }
    return 'Начать';
  }

  private flashStatus(message: string): void {
    window.clearTimeout(this.statusTimer);
    this.store.status = message;
    this.statusTimer = window.setTimeout(() => {
      if (this.store.status === message) {
        this.store.status = '';
      }
    }, STATUS_FLASH_MS);
  }

  private async primaryAction(): Promise<void> {
    if (this.store.mode === 'process' && (this.store.hasSession || this.store.isActive)) {
      this.resetSession();
    }

    if (this.store.isActive) {
      return;
    }

    await this.startSession();
  }

  private async startSession(): Promise<void> {
    if (this.store.isStarting || this.store.isActive) {
      return;
    }

    this.store.isStarting = true;
    this.geometryPipeline.reset();
    this.warmUpUntil = performance.now() + WARMUP_MS;
    this.pitchContour.reset();
    this.processMode?.reset();
    this.processMode?.beginSession();
    this.sessionStarted = Date.now();
    this.voiceAccumMs = 0;
    this.lastFrameTs = 0;

    try {
      this.store.status = 'Подключаем микрофон…';
      const analyser = await this.audio.start();
      this.sessionLoop?.start(analyser);

      this.store.isActive = true;
      this.store.isPaused = false;
      this.frozenIndex = null;
      this.store.activeSnapshot = null;

      if (!this.voiceProfile.isCalibrated()) {
        this.startCalibrationFlow(true);
      } else {
        this.store.isCalibrating = false;
        this.store.status = 'Слушаю…';
        if (this.voiceProfile.suggestSoftRecalibration()) {
          this.flashStatus('Профиль давно не обновляли — «Перекалибровать» по желанию');
        }
      }
    } catch {
      this.store.status = 'Не удалось получить микрофон. Проверьте разрешение в браузере.';
      this.store.isActive = false;
    } finally {
      this.store.isStarting = false;
    }
  }

  private async pause(): Promise<void> {
    if (!this.store.isActive) {
      return;
    }

    if (this.store.isPaused) {
      await this.audio.resume();
      this.sessionLoop?.resume();
      this.store.isPaused = false;
      return;
    }

    this.sessionLoop?.pause();
    await this.audio.suspend();
    this.store.isPaused = true;
  }

  private stop(): void {
    if (!this.store.isActive && !this.store.hasSession) {
      return;
    }

    this.calibration.abort();
    this.sessionLoop?.stop();
    this.audio.stop();
    this.store.isActive = false;
    this.store.isPaused = false;
    this.store.status = '';

    if (this.store.mode === 'process' && this.processMode) {
      this.processMode.finalize(this.pitchContour.clonePoints());
      this.syncTimeline();
      if (this.processMode.getSnapshots().length > 0) {
        this.frozenIndex = -1;
        this.store.activeSnapshot = -1;
        this.processMode.showComposite();
        this.flashStatus('Итог — экспорт соберёт форму из показателей');
      }
    }
  }

  private resetSession(): void {
    this.calibration.abort();
    this.sessionLoop?.stop();
    this.audio.stop();
    this.pitchContour.reset();
    this.processMode?.reset();
    this.geometryPipeline.reset();
    this.renderer?.clear();
    this.lastSnapshot = null;
    this.frozenIndex = null;
    this.sessionStarted = 0;
    this.voiceAccumMs = 0;
    this.lastFrameTs = 0;

    this.store.isActive = false;
    this.store.isPaused = false;
    this.store.hasSession = false;
    this.store.isStarting = false;
    this.store.status = '';
    this.store.rms = 0;
    this.store.rmsNorm = 0;
    this.store.frequencyLabel = '—';
    this.store.symmetry = '6';
    this.store.silenceLabel = '—';
    this.store.timeline = [];
    this.store.activeSnapshot = null;
    this.store.isCalibrating = false;
    this.store.calibrationProgress = 0;
    this.store.calibrationPrompt = '';
  }

  private async recalibrate(): Promise<void> {
    if (this.store.isCalibrating || this.store.isStarting) {
      return;
    }

    try {
      await this.ensureMicLive();
      this.startCalibrationFlow(false);
      this.flashStatus('Калибровка — говорите по подсказкам в круге');
    } catch {
      this.store.status = 'Не удалось начать калибровку — проверьте микрофон';
    }
  }

  /** Микрофон включён и идёт захват кадров. */
  private async ensureMicLive(): Promise<void> {
    if (this.store.isActive) {
      if (this.store.isPaused) {
        await this.pause();
      }
      return;
    }

    this.store.isStarting = true;
    this.warmUpUntil = performance.now() + WARMUP_MS;

    try {
      this.store.status = 'Подключаем микрофон…';
      const analyser = await this.audio.start();
      this.sessionLoop?.start(analyser);
      this.store.isActive = true;
      this.store.isPaused = false;
      this.store.hasSession = true;
      this.frozenIndex = null;
      this.store.activeSnapshot = null;
    } finally {
      this.store.isStarting = false;
    }
  }

  private startCalibrationFlow(firstTime: boolean): void {
    this.store.isCalibrating = true;
    this.store.calibrationProgress = 0;
    this.store.calibrationPrompt = 'Тихо, как шёпот — несколько секунд';
    this.store.status = firstTime
      ? 'Первый раз — калибровка под ваш голос (~12 сек)'
      : 'Калибровка под ваш голос (~12 сек)';
    this.beginCalibrationVisual();

    this.calibration.start(
      (ui) => this.applyCalibrationUi(ui),
      () => this.onCalibrationComplete(),
    );
  }

  private applyCalibrationUi(ui: { isCalibrating: boolean; progress: number; prompt: string }): void {
    this.store.isCalibrating = ui.isCalibrating;
    this.store.calibrationProgress = ui.progress;
    this.store.calibrationPrompt = ui.prompt;

    if (this.renderer instanceof EqLabRenderer) {
      this.renderer.setCalibrationState(
        ui.isCalibrating,
        ui.progress / 100,
        ui.prompt,
      );
    }
  }

  private onCalibrationComplete(): void {
    this.store.isCalibrating = false;
    this.store.calibrationProgress = 100;
    this.store.status = '';
    this.flashStatus('Калибровка готова — звучите как хотите');
    if (this.renderer instanceof EqLabRenderer) {
      this.renderer.setCalibrationState(false, 0, '');
    }
  }

  private beginCalibrationVisual(): void {
    if (!(this.renderer instanceof EqLabRenderer)) {
      return;
    }
    this.renderer.setCalibrationState(true, 0, this.voiceProfile.calibrationPrompt());
    this.renderer.setSpectrumGain(0.2);
    this.renderer.setLiveMetrics(0, 0, false);
    this.renderer.render({
      radius: 128,
      rays: 6,
      rotationSpeed: 0,
      hue: 260,
      opacity: 0.35,
      symmetry: 6,
      breathRing: 0,
      lineWidth: 0.75,
      waveAmplitude: 0,
      spiralTurns: 0,
      dotCount: 0,
      elementCount: 7,
      pitchAngle: 0,
    });
  }

  private skipCalibration(): void {
    if (!this.store.isCalibrating && !this.voiceProfile.isCalibrating()) {
      return;
    }
    this.calibration.skip();
    this.store.isCalibrating = false;
    this.store.calibrationProgress = 100;
    this.store.status = '';
    if (this.renderer instanceof EqLabRenderer) {
      this.renderer.setCalibrationState(false, 0, '');
    }
    this.flashStatus('Калибровка пропущена — можно звучать');
  }

  private onAudioFrame(frame: AudioFrame): void {
    this.store.rms = frame.features.rms;
    const frameDelta = this.lastFrameTs > 0 ? frame.timestamp - this.lastFrameTs : 16;
    this.lastFrameTs = frame.timestamp;

    if (this.voiceProfile.isCalibrating()) {
      this.calibration.pushFeatures(frame.features);
      const norm = this.voiceProfile.normalizeFeatures(frame.features);
      const levelNorm = frame.features.rms >= SILENCE_RMS ? norm.rms : 0;
      this.store.rmsNorm = Math.round(safeNormPct(levelNorm));
      this.feedEqVisual(frame, norm, true);
      return;
    }

    const norm = this.voiceProfile.normalizeFeatures(frame.features);
    const active = frame.features.rms >= SILENCE_RMS;
    const levelNorm = active ? norm.rms : 0;
    if (active) {
      this.voiceAccumMs += frameDelta;
    }
    this.store.rmsNorm = Math.round(safeNormPct(levelNorm));
    const params = this.geometryPipeline.resolve(frame.features, norm);

    const motifKind = this.pitchContour.push(norm, frame.features, active, params.symmetry);
    if (motifKind) {
      const label = motifLabel(motifKind);
      this.store.activeMotif = label;
      const now = frame.timestamp;
      if (now - this.lastMotifFlash > 700) {
        this.lastMotifFlash = now;
        this.flashStatus(label);
      }
    }
    const liveTrail = this.pitchContour.clonePoints();

    const snapshot: FeatureSnapshot = {
      ...frame,
      params,
      pitchTrail: liveTrail,
      spectrum: Array.from(downsampleBars(this.sessionLoop?.getSpectrumBars(64) ?? new Float32Array(0), EQ_BAND_COUNT)),
      sessionStarted: this.sessionStarted,
      profileHash: this.voiceProfile.getHash(),
      levelNorm,
      voiceMs: this.voiceAccumMs,
    };

    this.lastSnapshot = snapshot;
    this.store.hasSession = true;
    this.store.frequencyLabel = frame.features.frequency > 0
      ? `${Math.round(frame.features.frequency)} Hz · ${Math.round(norm.pitch * 100)}%`
      : '—';
    this.store.symmetry = symmetryLabel(params.symmetry);
    this.store.silenceLabel = formatSilenceLabel(frame.features.silenceRatio, frame.features.pauseMs);

    if (performance.now() < this.warmUpUntil && frame.features.rms < SILENCE_RMS && !this.geometryPipeline.hasHeldForm()) {
      return;
    }

    if (this.store.status === 'Слушаю…' || this.store.status.startsWith('Калибровка')) {
      this.store.status = '';
    }

    this.voiceProfile.observe(frame.features);
    this.updateDevPanel(snapshot, norm);
    this.applyRender(snapshot);
  }

  private applyRender(liveSnapshot: FeatureSnapshot): void {
    if (!this.renderer) {
      return;
    }

    if (this.frozenIndex !== null) {
      if (this.frozenIndex === -1) {
        this.processMode?.showComposite();
      } else {
        this.processMode?.show(this.frozenIndex);
      }
      return;
    }

    if (this.store.mode === 'process' && this.processMode) {
      const captured = this.processMode.capture(liveSnapshot);
      this.syncTimeline();
      if (captured) {
        const last = this.processMode.getSnapshots().at(-1);
        if (last) {
          this.flashStatus(`Слепок: ${last.label}`);
        }
      }
    }

    if (this.renderer.setSpectrum && this.sessionLoop) {
      this.renderer.setSpectrum(this.sessionLoop.getSpectrumBars(64));
    }

    if (this.renderer instanceof EqLabRenderer) {
      this.renderer.setSpectrumGain(this.voiceProfile.spectrumGain(liveSnapshot.features.rms));
      this.renderer.setCalibrationState(false, 0, '');
      const levelNorm = liveSnapshot.levelNorm
        ?? (liveSnapshot.features.rms >= SILENCE_RMS
          ? this.voiceProfile.normalizeFeatures(liveSnapshot.features).rms
          : 0);
      this.renderer.setLiveMetrics(
        liveSnapshot.features.frequency,
        levelNorm,
        liveSnapshot.features.rms >= SILENCE_RMS,
      );
    }

    this.renderer.render(liveSnapshot.params, liveSnapshot.pitchTrail ?? []);
  }

  private feedEqVisual(frame: AudioFrame, norm: NormalizedFeatures, calibrating: boolean): void {
    if (!this.renderer || !(this.renderer instanceof EqLabRenderer)) {
      return;
    }

    if (this.sessionLoop && this.renderer.setSpectrum) {
      this.renderer.setSpectrumGain(this.voiceProfile.spectrumGain(frame.features.rms));
      this.renderer.setSpectrum(this.sessionLoop.getSpectrumBars(64));
    }

    this.renderer.setLiveMetrics(
      frame.features.frequency,
      frame.features.rms >= SILENCE_RMS ? norm.rms : 0,
      frame.features.rms >= SILENCE_RMS,
    );

    if (calibrating) {
      this.renderer.setCalibrationState(
        true,
        this.voiceProfile.calibrationProgress(),
        this.voiceProfile.calibrationPrompt(),
      );
    }

    const params = this.geometryPipeline.resolve(frame.features, norm);
    this.renderer.render(params);
  }

  private syncTimeline(): void {
    if (!this.processMode) {
      return;
    }

    const entries: TimelineEntry[] = this.processMode.getSnapshots().map((snap, index) => ({
      index,
      label: snap.label,
      isComposite: false,
    }));

    const composite = this.processMode.getComposite();
    if (composite) {
      entries.push({ index: -1, label: composite.label, isComposite: true });
    }

    this.store.timeline = entries;
    requestAnimationFrame(() => this.scrollTimelineToEnd());
  }

  private scrollTimelineToEnd(): void {
    const scroller = document.querySelector('.process-timeline-scroll');
    if (!(scroller instanceof HTMLElement)) {
      return;
    }
    scroller.scrollLeft = scroller.scrollWidth;
  }

  private setMode(mode: LabMode): void {
    this.store.mode = mode;

    if (mode === 'live') {
      this.frozenIndex = null;
      this.store.activeSnapshot = null;
      if (this.lastSnapshot) {
        this.renderer?.render(this.lastSnapshot.params, this.lastSnapshot.pitchTrail ?? []);
      }
      return;
    }

    this.syncTimeline();
    if (this.frozenIndex === null && this.processMode && this.processMode.getSnapshots().length > 0) {
      const last = this.processMode.getSnapshots().at(-1);
      if (last) {
        this.renderer?.renderSnapshot(last);
      }
    } else if (this.frozenIndex === null && this.lastSnapshot) {
      this.renderer?.render(this.lastSnapshot.params, this.lastSnapshot.pitchTrail ?? []);
    }
  }

  private setGeometryStyle(style: GeometryStyle): void {
    this.store.geometryStyle = style;
    this.renderer?.setStyle(style);
    if (this.frozenIndex !== null) {
      return;
    }
    if (this.lastSnapshot) {
      this.renderer?.render(this.lastSnapshot.params, this.lastSnapshot.pitchTrail ?? []);
    }
  }

  private showLive(): void {
    this.frozenIndex = null;
    this.store.activeSnapshot = null;

    if (this.lastSnapshot) {
      this.renderer?.render(this.lastSnapshot.params, this.lastSnapshot.pitchTrail ?? []);
    }
  }

  private selectSnapshot(index: number): void {
    this.frozenIndex = index;
    this.store.activeSnapshot = index;

    if (index === -1) {
      this.processMode?.showComposite();
    } else {
      this.processMode?.show(index);
    }
  }

  private refreshCanvas(): void {
    this.renderer?.resize();
    if (!this.renderer) {
      return;
    }

    if (this.frozenIndex !== null) {
      if (this.frozenIndex === -1) {
        this.processMode?.showComposite();
      } else {
        this.processMode?.show(this.frozenIndex);
      }
      return;
    }

    if (this.lastSnapshot) {
      this.renderer.render(this.lastSnapshot.params, this.lastSnapshot.pitchTrail ?? []);
    }
  }

  private async toggleFullscreen(): Promise<void> {
    if (!this.workspaceEl) {
      return;
    }

    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }

    await this.workspaceEl.requestFullscreen();
    requestAnimationFrame(() => this.refreshCanvas());
  }

  private getExportSnapshot(): FeatureSnapshot | null {
    if (this.frozenIndex !== null && this.processMode) {
      return this.processMode.getEntry(this.frozenIndex);
    }
    if (this.store.mode === 'process' && this.processMode?.getComposite()) {
      return this.processMode.getComposite();
    }
    if (!this.lastSnapshot) {
      return null;
    }
    return {
      ...this.lastSnapshot,
      pitchTrail: this.pitchContour.clonePoints(),
      voiceMs: this.voiceAccumMs,
    };
  }

  private exportSvg(): void {
    const snap = this.getExportSnapshot();
    if (!snap) {
      this.flashStatus('Нечего экспортировать — сначала запишите сессию');
      return;
    }
    const readiness = validateExportReadiness(snap);
    if (!readiness.ok) {
      this.flashStatus(readiness.message ?? 'Мало данных для экспорта');
      return;
    }
    try {
      downloadSvg(exportMandalaSvg(snap, this.store.geometryStyle), 'sgl-mandala.svg');
    } catch {
      this.flashStatus('Не удалось собрать SVG — попробуйте ещё раз');
    }
  }

  private exportPng(): void {
    const snap = this.getExportSnapshot();
    if (!snap) {
      this.flashStatus('Нечего экспортировать — сначала запишите сессию');
      return;
    }
    const readiness = validateExportReadiness(snap);
    if (!readiness.ok) {
      this.flashStatus(readiness.message ?? 'Мало данных для экспорта');
      return;
    }
    try {
      downloadPng(exportMandalaPng(snap, this.store.geometryStyle), 'sgl-mandala.png');
    } catch {
      this.flashStatus('Не удалось собрать PNG — попробуйте ещё раз');
    }
  }

  private async exportFrames(): Promise<void> {
    if (!this.processMode) {
      return;
    }

    const snapshots = this.processMode.getSnapshots();
    if (snapshots.length === 0) {
      return;
    }

    this.store.status = 'Собираем экспорт…';
    try {
      await exportSessionFrames(
        snapshots,
        this.store.geometryStyle,
        this.voiceProfile.getMetrics(),
      );
      this.flashStatus('Архив sgl-session.zip скачан');
    } catch {
      this.flashStatus('Не удалось собрать архив — попробуйте ещё раз');
    } finally {
      if (this.store.status === 'Собираем экспорт…') {
        this.store.status = '';
      }
    }
  }

  private async savePattern(): Promise<void> {
    if (!this.lastSnapshot) {
      return;
    }

    const payload = {
      mode: this.store.mode,
      geometryStyle: this.store.geometryStyle,
      geometryParams: this.lastSnapshot.params,
      featureTimeline: this.processMode?.getSnapshots().map((s) => ({
        timestamp: s.timestamp,
        features: s.features,
        params: s.params,
      })) ?? [],
      svg: (() => {
        const snap = this.getExportSnapshot();
        return snap ? exportMandalaSvg(snap, this.store.geometryStyle) : '';
      })(),
      voiceProfileHash: this.voiceProfile.hash(),
    };

    const response = await fetch('/api/patterns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload),
    });

    if (response.status === 401) {
      window.location.href = '/account';
      return;
    }

    if (!response.ok) {
      this.store.status = 'Не удалось сохранить узор';
      return;
    }

    this.store.status = 'Узор сохранён';
    window.setTimeout(() => {
      if (this.store.status === 'Узор сохранён') {
        this.store.status = '';
      }
    }, 2500);
  }

  private mountDevPanel(): void {
    const panel = document.createElement('aside');
    panel.className = 'lab-dev-panel';
    panel.setAttribute('aria-hidden', 'true');
    panel.innerHTML = '<pre class="lab-dev-panel__pre"></pre>';
    this.workspaceEl?.appendChild(panel);
    this.devPanelEl = panel;
  }

  private updateDevPanel(snapshot: FeatureSnapshot, norm: NormalizedFeatures): void {
    if (!this.devPanelEl) {
      return;
    }

    const pre = this.devPanelEl.querySelector('.lab-dev-panel__pre');
    if (!(pre instanceof HTMLElement)) {
      return;
    }

    const bands = snapshot.spectrum?.map((v) => v.toFixed(2)).join(' ') ?? '—';
    pre.textContent = [
      `rms ${snapshot.features.rms.toFixed(4)} · norm ${norm.rms.toFixed(2)} · voice ${Math.round(this.voiceAccumMs)}ms`,
      `f₀ ${snapshot.features.frequency.toFixed(0)} Hz · trail ${snapshot.pitchTrail?.length ?? 0}`,
      `params hue ${snapshot.params.hue.toFixed(0)} sym ${snapshot.params.symmetry} op ${snapshot.params.opacity.toFixed(2)}`,
      `spectrum ${bands}`,
    ].join('\n');
  }
}

function safeNormPct(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(Math.max(value, 0), 1) * 100;
}

export function createLabShell(): { theme: string; toggleTheme: () => void } {
  const stored = localStorage.getItem('sgl-theme');
  const initial = stored ?? 'theme-dark';

  return {
    theme: initial,
    toggleTheme(): void {
      this.theme = this.theme === 'theme-dark' ? 'theme-light' : 'theme-dark';
      localStorage.setItem('sgl-theme', this.theme);
      document.dispatchEvent(new CustomEvent('sgl-theme-change'));
    },
  };
}

export function bootstrapLab(): LabApp | null {
  const canvas = document.getElementById('mandala-canvas');
  if (!(canvas instanceof HTMLCanvasElement)) {
    return null;
  }

  const lab = new LabApp();
  lab.init(canvas);

  return lab;
}
