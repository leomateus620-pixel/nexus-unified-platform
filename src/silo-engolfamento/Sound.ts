import type { SimulationSnapshot } from "./simulation";

/** Opt-in procedural grain rustle. Not an acoustic or clinical model. */
export class SiloSound {
  private context: AudioContext;
  private source: AudioBufferSourceNode;
  private gain: GainNode;
  private filter: BiquadFilterNode;
  constructor() {
    this.context = new AudioContext();
    const buffer = this.context.createBuffer(1, this.context.sampleRate, this.context.sampleRate),
      data = buffer.getChannelData(0);
    let seed = 42;
    for (let i = 0; i < data.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      data[i] = (seed / 4294967296 - 0.5) * 0.4;
    }
    this.source = this.context.createBufferSource();
    this.source.buffer = buffer;
    this.source.loop = true;
    this.gain = this.context.createGain();
    this.gain.gain.value = 0;
    this.filter = this.context.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 1800;
    this.source.connect(this.filter).connect(this.gain).connect(this.context.destination);
    this.source.start();
    void this.context.resume();
  }
  update(snapshot: SimulationSnapshot) {
    this.gain.gain.setTargetAtTime(
      snapshot.status === "running" ? snapshot.frame.gate * 0.24 : 0,
      this.context.currentTime,
      0.12,
    );
    this.filter.frequency.setTargetAtTime(
      snapshot.camera === "victim" && snapshot.frame.workers.B.depth > 1 ? 350 : 1800,
      this.context.currentTime,
      0.2,
    );
  }
  dispose() {
    this.source.stop();
    this.source.disconnect();
    this.filter.disconnect();
    this.gain.disconnect();
    void this.context.close();
  }
}
