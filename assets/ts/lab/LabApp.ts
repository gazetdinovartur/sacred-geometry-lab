import Alpine from 'alpinejs';
import { AudioEngine } from '../audio/AudioEngine';
import { ThreeLabRenderer } from '../three/ThreeLabRenderer';
import type { LabRenderer } from '../geometry/LabRenderer';
import { AudioSessionLoop } from '../modes/AudioSessionLoop';
import { ProcessMode } from '../modes/ProcessMode';
import { GeometryPipeline, SILENCE_RMS } from '../geometry/GeometryPipeline';
import type { AudioFrame } from '../modes/AudioSessionLoop';
import { formatSilenceLabel } from '../geometry/SilenceMapper';
import { downloadPng, downloadSvg } from '../export/exportFiles';
import { VoiceProfile } from '../audio/VoiceProfile';
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
  modeHint: () => string;
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
  recalibrate: () => void;
};

export class LabApp {
  private audio = new AudioEngine();
  private renderer: LabRenderer | null = null;
  private sessionLoop: AudioSessionLoop | null = null;
  private processMode: ProcessMode | null = null;
  private voiceProfile = new VoiceProfile();
  private pitchContour = new PitchContour();
  private lastSnapshot: FeatureSnapshot | null = null;
  private frozenIndex: number | null = null;
  private workspaceEl: HTMLElement | null = null;
  private geometryPipeline = new GeometryPipeline();
  private warmUpUntil = 0;
  private statusTimer = 0;
  private lastMotifFlash = 0;

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

    modeHint: () => this.modeHint(),
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

    this.renderer = new ThreeLabRenderer(canvas);
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
  }

  private primaryLabel(): string {
    if (this.store.mode === 'process' && (this.store.hasSession || this.store.isActive)) {
      return 'Начать сначала';
    }
    return 'Начать';
  }

  private modeHint(): string {
    switch (this.store.mode) {
      case 'live':
        return 'Момент — звук → слои и узоры. Громче, выше, резче — разные формы.';
      case 'process':
        return 'Процесс — тот же движок, слепки на таймлайне. Стоп — итог и контур сессии.';
      default:
        return '';
    }
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

    try {
      this.store.status = 'Подключаем микрофон…';
      const analyser = await this.audio.start();
      this.sessionLoop?.start(analyser);

      this.store.isActive = true;
      this.store.isPaused = false;
      this.frozenIndex = null;
      this.store.activeSnapshot = null;

      if (this.voiceProfile.needsCalibration()) {
        this.voiceProfile.beginSessionCalibration();
        this.store.isCalibrating = true;
        this.store.calibrationProgress = 0;
        this.store.calibrationPrompt = this.voiceProfile.calibrationPrompt();
        this.store.status = 'Первый раз — калибровка под ваш голос (~12 сек)';
      } else {
        this.store.isCalibrating = false;
        this.store.status = 'Слушаю…';
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
        this.flashStatus('Итог — контур и слои сессии');
      }
    }
  }

  private resetSession(): void {
    this.sessionLoop?.stop();
    this.audio.stop();
    this.pitchContour.reset();
    this.processMode?.reset();
    this.geometryPipeline.reset();
    this.renderer?.clear();
    this.lastSnapshot = null;
    this.frozenIndex = null;

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

  private recalibrate(): void {
    this.voiceProfile.reset();
    this.flashStatus('Профиль сброшен — при «Начать» снова калибровка');
  }

  private skipCalibration(): void {
    if (!this.store.isCalibrating) {
      return;
    }
    this.voiceProfile.skipCalibration();
    this.store.isCalibrating = false;
    this.store.calibrationProgress = 100;
    this.store.status = 'Калибровка пропущена — слушаю…';
    this.flashStatus('Можно звучать — форма подстроится по ходу');
  }

  private onAudioFrame(frame: AudioFrame): void {
    this.store.rms = frame.features.rms;

    if (this.store.isCalibrating) {
      this.store.calibrationProgress = Math.round(this.voiceProfile.calibrationProgress() * 100);
      this.store.calibrationPrompt = this.voiceProfile.calibrationPrompt();
      const done = this.voiceProfile.addCalibrationSample(frame.features);
      if (done) {
        this.store.isCalibrating = false;
        this.store.calibrationProgress = 100;
        this.store.status = '';
        this.flashStatus('Калибровка готова — звучите как хотите');
      }
      return;
    }

    const norm = this.voiceProfile.normalizeFeatures(frame.features);
    this.store.rmsNorm = Math.round(norm.rms * 100);
    const params = this.geometryPipeline.resolve(frame.features, norm);

    const active = frame.features.rms >= SILENCE_RMS;
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
    this.renderer.render(liveSnapshot.params, liveSnapshot.pitchTrail ?? []);
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

  private exportSvg(): void {
    if (!this.renderer) {
      return;
    }
    downloadSvg(this.renderer.exportSvg());
  }

  private exportPng(): void {
    if (!this.renderer) {
      return;
    }
    downloadPng(this.renderer.exportPng());
  }

  private async exportFrames(): Promise<void> {
    if (!this.renderer || !this.processMode) {
      return;
    }

    const snapshots = this.processMode.getSnapshots();
    if (snapshots.length === 0) {
      return;
    }

    this.store.status = 'Собираем кадры…';
    try {
      await exportSessionFrames(this.renderer, snapshots);
      this.flashStatus('Архив mandala-frames.zip скачан');
    } finally {
      if (this.store.status === 'Собираем кадры…') {
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
      svg: this.renderer?.exportSvg() ?? '',
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
}

export function createLabShell(): { theme: string; toggleTheme: () => void } {
  const stored = localStorage.getItem('sgl-theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const initial = stored ?? (prefersDark ? 'theme-dark' : 'theme-light');

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
