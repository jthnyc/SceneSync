// Add to src/types/global.d.ts
interface Window {
  webkitAudioContext: typeof AudioContext;
}

declare module '*.mp3' {
  const src: string;
  export default src;
}

declare module '*.wav' {
  const src: string;
  export default src;
}