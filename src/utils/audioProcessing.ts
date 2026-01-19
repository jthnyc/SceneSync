export const convertToMono = (audioBuffer: AudioBuffer): Float32Array => {
  // Simple mono conversion: average channels
  if (audioBuffer.numberOfChannels === 1) {
    return audioBuffer.getChannelData(0);
  }
  
  const leftChannel = audioBuffer.getChannelData(0);
  const rightChannel = audioBuffer.getChannelData(1);
  const monoData = new Float32Array(leftChannel.length);
  
  for (let i = 0; i < leftChannel.length; i++) {
    monoData[i] = (leftChannel[i] + rightChannel[i]) / 2;
  }
  
  return monoData;
};

export const normalizeAudio = (audioData: Float32Array): Float32Array => {
  const max = Math.max(...Array.from(audioData.map(Math.abs)));
  if (max === 0) return audioData;
  
  const normalized = new Float32Array(audioData.length);
  for (let i = 0; i < audioData.length; i++) {
    normalized[i] = audioData[i] / max;
  }
  
  return normalized;
};

export const getAudioDuration = (file: File): Promise<number> => {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    audio.preload = 'metadata';
    
    audio.onloadedmetadata = () => {
      resolve(audio.duration);
    };
    
    audio.onerror = () => {
      reject(new Error('Failed to load audio metadata'));
    };
    
    audio.src = URL.createObjectURL(file);
  });
};

// Ensure it's a module
export { };