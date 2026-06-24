import type { CinemaSessionBundle, FeatureSnapshot, SessionTimelineSample } from '../types';
import { downsampleTrail } from '../geometry/voiceMandalaLayers';

const SAMPLE_INTERVAL_MS = 83;
const MAX_TRAIL_POINTS = 48;

function pickAudioMimeType(): string | undefined {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

/** Захват аудио + таймлайна для кино-экспорта (только в браузере, не на сервер). */
export class SessionCapture {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private samples: SessionTimelineSample[] = [];
  private captureStartedAt = 0;
  private lastSampleAt = 0;
  private recording = false;
  private paused = false;

  prepare(captureStartedAt: number): void {
    this.reset();
    this.captureStartedAt = captureStartedAt;
  }

  startAudio(stream: MediaStream): void {
    if (this.recording) {
      return;
    }

    const mimeType = pickAudioMimeType();
    this.recorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);
    this.chunks = [];
    this.recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.chunks.push(event.data);
      }
    };
    this.recorder.start(1000);
    this.recording = true;
    this.paused = false;
  }

  pause(): void {
    this.paused = true;
    if (this.recorder?.state === 'recording') {
      this.recorder.pause();
    }
  }

  resume(): void {
    this.paused = false;
    if (this.recorder?.state === 'paused') {
      this.recorder.resume();
    }
  }

  pushSample(snapshot: FeatureSnapshot): void {
    if (!this.recording || this.paused) {
      return;
    }

    const now = performance.now();
    if (now - this.lastSampleAt < SAMPLE_INTERVAL_MS) {
      return;
    }
    this.lastSampleAt = now;

    this.samples.push({
      timeMs: now - this.captureStartedAt,
      features: { ...snapshot.features },
      params: { ...snapshot.params },
      spectrum: snapshot.spectrum ? [...snapshot.spectrum] : undefined,
      pitchTrail: downsampleTrail(snapshot.pitchTrail ?? [], MAX_TRAIL_POINTS).map((p) => ({ ...p })),
      levelNorm: snapshot.levelNorm,
    });
  }

  hasData(): boolean {
    return this.samples.length >= 24 && this.chunks.length > 0;
  }

  getSampleCount(): number {
    return this.samples.length;
  }

  async finalize(processSnapshots: FeatureSnapshot[]): Promise<CinemaSessionBundle | null> {
    if (!this.recording || !this.recorder) {
      return null;
    }

    const blob = await this.stopRecorder();
    this.recording = false;

    if (!blob || this.samples.length < 12) {
      return null;
    }

    const audioDurationMs = await measureAudioDurationMs(blob);

    return {
      audioBlob: blob,
      audioDurationMs,
      samples: this.samples,
      processSnapshots: processSnapshots.map((s) => structuredClone(s)),
      captureStartedAt: this.captureStartedAt,
      profileHash: processSnapshots[0]?.profileHash,
    };
  }

  reset(): void {
    if (this.recorder && this.recorder.state !== 'inactive') {
      try {
        this.recorder.stop();
      } catch {
        // ignore
      }
    }
    this.recorder = null;
    this.chunks = [];
    this.samples = [];
    this.captureStartedAt = 0;
    this.lastSampleAt = 0;
    this.recording = false;
    this.paused = false;
  }

  private stopRecorder(): Promise<Blob | null> {
    const recorder = this.recorder;
    if (!recorder || recorder.state === 'inactive') {
      return Promise.resolve(this.chunks.length ? new Blob(this.chunks, { type: recorder?.mimeType ?? 'audio/webm' }) : null);
    }

    return new Promise((resolve) => {
      recorder.addEventListener('stop', () => {
        resolve(new Blob(this.chunks, { type: recorder.mimeType || 'audio/webm' }));
      }, { once: true });
      recorder.stop();
    });
  }
}

async function measureAudioDurationMs(blob: Blob): Promise<number> {
  const ctx = new AudioContext();
  try {
    const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
    return buffer.duration * 1000;
  } finally {
    await ctx.close();
  }
}
