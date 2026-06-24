export class AudioEngine {
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;

  async start(): Promise<AnalyserNode> {
    if (this.analyser) {
      if (this.context?.state === 'suspended') {
        await this.context.resume();
      }
      return this.analyser;
    }

    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.context = new AudioContext();
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.52;

    this.source = this.context.createMediaStreamSource(this.stream);
    this.source.connect(this.analyser);

    if (this.context.state === 'suspended') {
      await this.context.resume();
    }

    return this.analyser;
  }

  getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  getStream(): MediaStream | null {
    return this.stream;
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
    this.source?.disconnect();
    this.source = null;
    this.analyser = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    void this.context?.close();
    this.context = null;
  }

  isRunning(): boolean {
    return this.analyser !== null;
  }
}
