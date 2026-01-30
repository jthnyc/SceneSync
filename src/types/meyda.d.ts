declare module 'meyda' {
  export interface MeydaAnalyzer {
    get(features: string | string[]): any;
    start(): void;
    stop(): void;
  }

  export interface MeydaOptions {
    audioContext: AudioContext;
    source: MediaElementAudioSourceNode | AudioBufferSourceNode;
    bufferSize: number;
    featureExtractors: string[];
    callback?: (features: any) => void;
  }

  export default class Meyda {
    static createMeydaAnalyzer(options: MeydaOptions): MeydaAnalyzer;
    static extract(features: string | string[], signal: Float32Array | number[], bufferSize?: number, sampleRate?: number): any;
    static bufferSize: number;
  }
}