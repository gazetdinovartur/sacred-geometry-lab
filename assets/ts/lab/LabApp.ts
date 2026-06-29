import Alpine from 'alpinejs';
import { AudioEngine } from '../audio/AudioEngine';
import { EqLabRenderer, downsampleBars, SPECTRUM_EXPORT_BANDS } from '../geometry/EqLabRenderer';
import type { LabRenderer } from '../geometry/LabRenderer';
import { AudioSessionLoop } from '../modes/AudioSessionLoop';
import { ProcessMode } from '../modes/ProcessMode';
import { GeometryPipeline } from '../geometry/GeometryPipeline';
import type { AudioFrame } from '../modes/AudioSessionLoop';
import { formatSilenceLabel } from '../geometry/SilenceMapper';
import { downloadPng, downloadSvg } from '../export/exportFiles';
import { mandalaPngFilename, mandalaSvgFilename } from '../export/exportNames';
import { exportMandalaPng, exportMandalaSvg } from '../export/mandalaExport';
import { validateExportReadiness } from '../export/exportValidation';
import { VoiceProfile, type NormalizedFeatures } from '../audio/VoiceProfile';
import { CalibrationRunner } from './CalibrationRunner';
import { PitchContour } from '../geometry/PitchContour';
import { motifLabel } from '../geometry/MotifPicker';
import { exportSessionFrames } from '../export/exportFrames';
import type { ExportAction, ExportSize, ExportStyle } from '../export/exportOptions';
import { DEFAULT_EXPORT_SIZE, exportActionLabel } from '../export/exportOptions';
import type { CinemaSessionBundle, FeatureSnapshot, LabMode, TimelineEntry } from '../types';
import { formatPitchLabel } from '../audio/PitchNotation';
import { SessionCapture } from '../export/SessionCapture';

const WARMUP_MS = 900;
const STATUS_FLASH_MS = 1800;

type LabStore = {
  onLabPage: boolean;
  mode: LabMode;
  exportStyle: ExportStyle;
  exportAction: ExportAction;
  exportSize: ExportSize;
  exportActions: { value: ExportAction; label: string }[];
  processSnapshotCount: number;
  exportActionButtonLabel: () => string;
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
  toneLabel: string;
  silenceLabel: string;
  timeline: TimelineEntry[];
  activeSnapshot: number | null;
  primaryLabel: () => string;
  setMode: (mode: LabMode) => void;
  setExportStyle: (style: ExportStyle) => void;
  setExportAction: (action: ExportAction) => void;
  primaryAction: () => Promise<void>;
  pause: () => Promise<void>;
  stop: () => Promise<void>;
  runExportAction: () => Promise<void>;
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
  private sessionCapture = new SessionCapture();
  private cinemaBundle: CinemaSessionBundle | null = null;
  private captureStartedAt = 0;
  private sessionStarted = 0;
  private voiceAccumMs = 0;
  private lastFrameTs = 0;
  private devPanelEl: HTMLElement | null = null;
  private readonly devMode = new URLSearchParams(window.location.search).get('dev') === '1';

  private readonly storeRef: LabStore = {
    onLabPage: false,
    mode: 'live',
    exportStyle: 'dots',
    exportAction: 'png',
    exportSize: DEFAULT_EXPORT_SIZE,
    exportActions: [],
    processSnapshotCount: 0,
    exportActionButtonLabel: () => exportActionLabel(this.store.exportAction),
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
    toneLabel: '—',
    silenceLabel: '—',
    timeline: [],
    activeSnapshot: null,

    primaryLabel: () => this.primaryLabel(),
    setMode: (mode) => this.setMode(mode),
    setExportStyle: (style) => this.setExportStyle(style),
    setExportAction: (action) => this.setExportAction(action),
    primaryAction: () => this.primaryAction(),
    pause: () => this.pause(),
    stop: () => this.stop(),
    runExportAction: () => this.runExportAction(),
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

    this.refreshExportActions();
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

      this.captureStartedAt = performance.now();
      this.sessionCapture.prepare(this.captureStartedAt);
      const stream = this.audio.getStream();
      if (stream) {
        this.sessionCapture.startAudio(stream);
      }

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
      this.sessionCapture.resume();
      this.store.isPaused = false;
      return;
    }

    this.sessionLoop?.pause();
    this.sessionCapture.pause();
    await this.audio.suspend();
    this.store.isPaused = true;
  }

  private async stop(): Promise<void> {
    if (!this.store.isActive && !this.store.hasSession) {
      return;
    }

    this.calibration.abort();
    this.sessionLoop?.stop();

    if (this.store.mode === 'process' && this.processMode) {
      if (this.lastSnapshot) {
        this.processMode.ensureClosingCapture(this.lastSnapshot);
      }
      this.processMode.finalize(this.pitchContour.clonePoints());
      this.syncTimeline();
      if (this.processMode.getSnapshots().length > 0) {
        this.frozenIndex = -1;
        this.store.activeSnapshot = -1;
        this.processMode.showComposite();
        this.flashStatus('Итог — экспорт соберёт форму из показателей');
      }
    }

    const snapshots = this.processMode?.getSnapshots() ?? [];
    this.cinemaBundle = await this.sessionCapture.finalize(snapshots);

    this.audio.stop();
    this.store.isActive = false;
    this.store.isPaused = false;

    if (this.lastSnapshot && this.renderer) {
      this.renderer.renderSnapshot(this.lastSnapshot);
      if (this.store.mode === 'live') {
        this.flashStatus('Зафиксирован последний кадр — можно экспортировать');
      }
    }

    this.store.status = '';

    this.normalizeExportAction();
    this.refreshExportActions();
  }

  private resetSession(): void {
    this.calibration.abort();
    this.sessionLoop?.stop();
    this.audio.stop();
    this.sessionCapture.reset();
    this.cinemaBundle = null;
    this.captureStartedAt = 0;
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
    this.store.toneLabel = '—';
    this.store.silenceLabel = '—';
    this.store.timeline = [];
    this.store.activeSnapshot = null;
    this.store.processSnapshotCount = 0;
    this.refreshExportActions();
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
      const levelNorm = frame.features.isActive ? norm.rms : 0;
      this.store.rmsNorm = Math.round(safeNormPct(levelNorm));
      this.feedEqVisual(frame, norm, true);
      return;
    }

    const norm = this.voiceProfile.normalizeFeatures(frame.features);
    const active = frame.features.isActive;
    const levelNorm = active ? norm.rms : 0;
    if (active) {
      this.voiceAccumMs += frameDelta;
    }
    this.store.rmsNorm = Math.round(safeNormPct(levelNorm));
    const params = this.geometryPipeline.resolve(frame.features, norm);

    const motifKind = this.pitchContour.push(norm, frame.features, active, params.symmetry);
    if (motifKind) {
      const label = motifLabel(motifKind);
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
      spectrum: Array.from(downsampleBars(
        this.sessionLoop?.getSpectrumBars(64) ?? new Float32Array(0),
        SPECTRUM_EXPORT_BANDS,
      )),
      sessionStarted: this.sessionStarted,
      profileHash: this.voiceProfile.getHash(),
      levelNorm,
      voiceMs: this.voiceAccumMs,
    };

    this.lastSnapshot = snapshot;
    this.store.hasSession = true;
    this.store.toneLabel = formatPitchLabel(frame.features.frequency, frame.features.pitchConfidence);
    this.store.silenceLabel = formatSilenceLabel(frame.features.silenceRatio, frame.features.pauseMs);

    if (performance.now() < this.warmUpUntil && !frame.features.isActive && !this.geometryPipeline.hasHeldForm()) {
      return;
    }

    if (this.store.status === 'Слушаю…' || this.store.status.startsWith('Калибровка')) {
      this.store.status = '';
    }

    this.voiceProfile.observe(frame.features);
    this.updateDevPanel(snapshot, norm);
    if (!this.voiceProfile.isCalibrating()) {
      this.sessionCapture.pushSample(snapshot);
    }
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
      this.renderer.setSpectrumGain(this.voiceProfile.spectrumGain(
        liveSnapshot.features.rms,
        liveSnapshot.features.spectralLevel,
      ));
      this.renderer.setCalibrationState(false, 0, '');
      const levelNorm = liveSnapshot.levelNorm
        ?? (liveSnapshot.features.isActive
          ? this.voiceProfile.normalizeFeatures(liveSnapshot.features).rms
          : 0);
      this.renderer.setPitchInfo(
        liveSnapshot.features.frequency,
        liveSnapshot.features.pitchConfidence,
      );
      this.renderer.setLiveMetrics(
        liveSnapshot.features.frequency,
        levelNorm,
        liveSnapshot.features.isActive,
      );
      this.renderer.setRhythmPulse(
        liveSnapshot.features.spectralFlux,
        levelNorm,
      );
    }

    this.renderer.render(liveSnapshot.params, liveSnapshot.pitchTrail ?? []);
  }

  private feedEqVisual(frame: AudioFrame, norm: NormalizedFeatures, calibrating: boolean): void {
    if (!this.renderer || !(this.renderer instanceof EqLabRenderer)) {
      return;
    }

    if (this.sessionLoop && this.renderer.setSpectrum) {
      this.renderer.setSpectrumGain(this.voiceProfile.spectrumGain(
        frame.features.rms,
        frame.features.spectralLevel,
      ));
      this.renderer.setSpectrum(this.sessionLoop.getSpectrumBars(64));
    }

    this.renderer.setLiveMetrics(
      frame.features.frequency,
      frame.features.isActive ? norm.rms : 0,
      frame.features.isActive,
    );
    this.renderer.setPitchInfo(frame.features.frequency, frame.features.pitchConfidence);
    this.renderer.setRhythmPulse(frame.features.spectralFlux, frame.features.isActive ? norm.rms : 0);

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
    this.store.processSnapshotCount = this.processMode.getSnapshots().length;
    this.refreshExportActions();
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
      this.normalizeExportAction();
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

  private setExportStyle(style: ExportStyle): void {
    this.store.exportStyle = style;
  }

  private setExportAction(action: ExportAction): void {
    this.store.exportAction = action;
  }

  private buildExportActions(): { value: ExportAction; label: string }[] {
    const options: { value: ExportAction; label: string }[] = [
      { value: 'png', label: exportActionLabel('png') },
      { value: 'svg', label: exportActionLabel('svg') },
    ];

    if (this.store.processSnapshotCount > 0) {
      options.push({ value: 'zip', label: exportActionLabel('zip') });
    }

    if (this.store.processSnapshotCount >= 2 && LabApp.canExportVideo()) {
      options.push({ value: 'video', label: exportActionLabel('video') });
    }

    if (this.cinemaBundle && this.cinemaBundle.samples.length >= 12 && LabApp.canExportCinema()) {
      options.push({ value: 'cinema', label: exportActionLabel('cinema') });
    }

    options.push({ value: 'save', label: exportActionLabel('save') });
    return options;
  }

  private refreshExportActions(): void {
    this.store.exportActions = this.buildExportActions();
    this.normalizeExportAction();
  }

  private normalizeExportAction(): void {
    if (this.store.exportAction === 'zip' && this.store.processSnapshotCount === 0) {
      this.store.exportAction = 'png';
    }
    if (this.store.exportAction === 'video' && (this.store.processSnapshotCount < 2 || !LabApp.canExportVideo())) {
      this.store.exportAction = 'png';
    }
    if (this.store.exportAction === 'cinema' && (!this.cinemaBundle || !LabApp.canExportCinema())) {
      this.store.exportAction = 'png';
    }
  }

  private static canExportVideo(): boolean {
    return typeof VideoEncoder !== 'undefined'
      && typeof VideoFrame !== 'undefined'
      && typeof createImageBitmap !== 'undefined';
  }

  private static canExportCinema(): boolean {
    return LabApp.canExportVideo() && typeof AudioEncoder !== 'undefined';
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
      const entry = this.processMode.getEntry(this.frozenIndex);
      return entry ? this.enrichExportSnapshot(entry) : null;
    }
    if (this.store.mode === 'process' && this.processMode?.getComposite()) {
      return this.enrichExportSnapshot(this.processMode.getComposite()!);
    }
    if (!this.lastSnapshot) {
      return null;
    }
    const processSnapshots = this.processMode?.getSnapshots();
    return this.enrichExportSnapshot({
      ...this.lastSnapshot,
      pitchTrail: this.pitchContour.clonePoints(),
      voiceMs: this.voiceAccumMs,
      processSnapshots: processSnapshots && processSnapshots.length > 0
        ? processSnapshots
        : undefined,
    });
  }

  private enrichExportSnapshot(snapshot: FeatureSnapshot): FeatureSnapshot {
    return {
      ...snapshot,
      pitchTrail: snapshot.pitchTrail ?? this.pitchContour.clonePoints(),
      voiceMs: snapshot.voiceMs ?? this.voiceAccumMs,
    };
  }

  private canExportZip(): boolean {
    return this.store.processSnapshotCount > 0;
  }

  private async runExportAction(): Promise<void> {
    this.normalizeExportAction();

    if (this.store.exportAction === 'save') {
      await this.saveToPlace();
      return;
    }

    if (this.store.exportAction === 'zip') {
      await this.exportSessionZip();
      return;
    }

    if (this.store.exportAction === 'video') {
      await this.exportSessionVideo();
      return;
    }

    if (this.store.exportAction === 'cinema') {
      await this.exportSessionCinema();
      return;
    }

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

    const style = this.store.exportStyle;

    try {
      const size = this.store.exportSize;
      if (this.store.exportAction === 'svg') {
        downloadSvg(exportMandalaSvg(snap, style, size), mandalaSvgFilename());
      } else {
        downloadPng(exportMandalaPng(snap, style, size), mandalaPngFilename());
      }
    } catch {
      this.flashStatus('Не удалось собрать мандалу — попробуйте другой стиль');
    }
  }

  private async exportSessionZip(): Promise<void> {
    if (!this.processMode) {
      return;
    }

    if (this.store.exportAction === 'zip' && !this.canExportZip()) {
      this.flashStatus('ZIP — после Process-сессии с этапами');
      return;
    }

    const snapshots = this.processMode.getSnapshots();
    if (snapshots.length === 0) {
      this.flashStatus('ZIP доступен после Process-сессии с этапами');
      return;
    }

    this.store.status = 'Собираем архив…';
    try {
      const zipName = await exportSessionFrames(
        snapshots,
        this.store.exportStyle,
        this.voiceProfile.getMetrics(),
        this.store.exportSize,
      );
      if (zipName) {
        this.flashStatus(`Скачан ${zipName}`);
      }
    } catch {
      this.flashStatus('Не удалось собрать архив — попробуйте ещё раз');
    } finally {
      if (this.store.status === 'Собираем архив…') {
        this.store.status = '';
      }
    }
  }

  private async exportSessionVideo(): Promise<void> {
    if (!this.processMode) {
      return;
    }

    const snapshots = this.processMode.getSnapshots();
    if (snapshots.length < 2) {
      this.flashStatus('Видео — после Process-сессии минимум с 2 этапами');
      return;
    }

    if (!LabApp.canExportVideo()) {
      this.flashStatus('Видео недоступно в этом браузере — используйте Chrome или Firefox');
      return;
    }

    this.store.status = 'Готовим видео… 0%';
    try {
      const { exportSessionVideo } = await import('../export/exportSessionVideo');
      const videoName = await exportSessionVideo(
        snapshots,
        this.store.exportStyle,
        this.store.exportSize,
        (state) => {
          const pct = Math.round(state.progress * 100);
          if (state.phase === 'done') {
            this.store.status = '';
            return;
          }
          this.store.status = state.phase === 'encode'
            ? `Кодируем видео… ${pct}%`
            : `Рендер кадров… ${state.frame}/${state.totalFrames} (${pct}%)`;
        },
      );
      if (videoName) {
        this.flashStatus(`Скачан ${videoName}`);
      }
    } catch {
      this.flashStatus('Не удалось собрать видео — попробуйте меньший размер');
    } finally {
      if (this.store.status.startsWith('Готовим видео') || this.store.status.startsWith('Рендер') || this.store.status.startsWith('Кодируем')) {
        this.store.status = '';
      }
    }
  }

  private async exportSessionCinema(): Promise<void> {
    if (!this.cinemaBundle) {
      this.flashStatus('Кино — после сессии со звуком (Chrome / Firefox)');
      return;
    }

    if (!LabApp.canExportCinema()) {
      this.flashStatus('Кино недоступно в этом браузере');
      return;
    }

    this.store.status = 'Готовим кино… 0%';
    try {
      const { exportSessionCinemaVideo } = await import('../export/exportSessionCinemaVideo');
      const name = await exportSessionCinemaVideo(
        this.cinemaBundle,
        this.store.exportStyle,
        this.store.exportSize,
        (state) => {
          const pct = Math.round(state.progress * 100);
          if (state.phase === 'done') {
            this.store.status = '';
            return;
          }
          if (state.phase === 'encode') {
            this.store.status = `Синхронизируем голос… ${pct}%`;
            return;
          }
          this.store.status = `Кино: кадры ${state.frame}/${state.totalFrames} (${pct}%)`;
        },
      );
      if (name) {
        this.flashStatus(`Скачан ${name}`);
      }
    } catch {
      this.flashStatus('Не удалось собрать кино — попробуйте 1600 px');
    } finally {
      if (this.store.status.startsWith('Готовим кино') || this.store.status.startsWith('Кино:') || this.store.status.startsWith('Синхронизируем')) {
        this.store.status = '';
      }
    }
  }

  private async saveToPlace(): Promise<void> {
    if (!this.lastSnapshot) {
      return;
    }

    const snap = this.getExportSnapshot();
    if (!snap) {
      this.flashStatus('Нечего сохранять — сначала запишите сессию');
      return;
    }

    const readiness = validateExportReadiness(snap);
    if (!readiness.ok) {
      this.flashStatus(readiness.message ?? 'Мало данных для сохранения');
      return;
    }

    const payload = {
      mode: this.store.mode,
      geometryStyle: this.store.exportStyle,
      geometryParams: this.lastSnapshot.params,
      featureTimeline: this.processMode?.getSnapshots().map((s) => ({
        timestamp: s.timestamp,
        features: s.features,
        params: s.params,
      })) ?? [],
      svg: (() => {
        const snap = this.getExportSnapshot();
        return snap ? exportMandalaSvg(snap, this.store.exportStyle, this.store.exportSize) : '';
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
      this.store.status = 'Не удалось положить в своё место';
      return;
    }

    this.store.status = 'Лежит в своём месте';
    window.setTimeout(() => {
      if (this.store.status === 'Лежит в своём месте') {
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
