export type DualAnalysers = {
  a: AnalyserNode;
  b: AnalyserNode;
};

/** Два независимых микрофона — режим «Диалог». */
export class DualAudioEngine {
  private context: AudioContext | null = null;
  private streamA: MediaStream | null = null;
  private streamB: MediaStream | null = null;
  private analyserA: AnalyserNode | null = null;
  private analyserB: AnalyserNode | null = null;

  async start(): Promise<DualAnalysers> {
    if (this.analyserA && this.analyserB) {
      if (this.context?.state === 'suspended') {
        await this.context.resume();
      }
      return { a: this.analyserA, b: this.analyserB };
    }

    this.streamA = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.streamB = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.context = new AudioContext();

    this.analyserA = this.createAnalyser(this.streamA);
    this.analyserB = this.createAnalyser(this.streamB);

    if (this.context.state === 'suspended') {
      await this.context.resume();
    }

    return { a: this.analyserA, b: this.analyserB };
  }

  async suspend(): Promise<void> {
    if (this.context?.state === 'running') {
      await this.context.suspend();
    }
  }

  async resume(): Promise<void> {
    if (this.context?.state === 'suspended') {
      await this.context.resume();
    }
  }

  stop(): void {
    this.analyserA = null;
    this.analyserB = null;
    this.streamA?.getTracks().forEach((track) => track.stop());
    this.streamB?.getTracks().forEach((track) => track.stop());
    this.streamA = null;
    this.streamB = null;
    void this.context?.close();
    this.context = null;
  }

  isRunning(): boolean {
    return this.analyserA !== null;
  }

  private createAnalyser(stream: MediaStream): AnalyserNode {
    const analyser = this.context!.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.52;
    this.context!.createMediaStreamSource(stream).connect(analyser);
    return analyser;
  }
}
