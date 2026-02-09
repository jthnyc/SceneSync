import React, { createContext, useContext, useState } from 'react';
import type { AudioFile, AudioFeatures } from '../types';

interface AudioContextType {
  audioFiles: AudioFile[];
  currentAudio: AudioFile | null;
  features: Map<string, AudioFeatures>;
  addAudioFiles: (files: File[]) => Promise<void>;
  removeAudioFile: (id: string) => void;
  setCurrentAudio: (audio: AudioFile | null) => void;
}

const AudioContext = createContext<AudioContextType | undefined>(undefined);

export const useAudio = () => {
  const context = useContext(AudioContext);
  if (!context) {
    throw new Error('useAudio must be used within AudioProvider');
  }
  return context;
};

export const AudioProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [audioFiles, setAudioFiles] = useState<AudioFile[]>([]);
  const [currentAudio, setCurrentAudio] = useState<AudioFile | null>(null);
  const [features, setFeatures] = useState<Map<string, AudioFeatures>>(new Map());

  const addAudioFiles = async (files: File[]) => {
    // TODO: Implement actual file processing
    const newAudioFiles: AudioFile[] = files.map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      name: file.name,
      size: file.size,
      type: file.type,
      url: URL.createObjectURL(file),
      uploadedAt: new Date(),
    }));
    
    setAudioFiles(prev => [...prev, ...newAudioFiles]);
  };

  const removeAudioFile = (id: string) => {
    setAudioFiles(prev => prev.filter(file => file.id !== id));
    setFeatures(prev => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  };

  return (
    <AudioContext.Provider value={{
      audioFiles,
      currentAudio,
      features,
      addAudioFiles,
      removeAudioFile,
      setCurrentAudio,
    }}>
      {children}
    </AudioContext.Provider>
  );
};