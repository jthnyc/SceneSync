import { useState, useCallback, useEffect } from 'react';
import { audioStorage } from '../services/audioStorageService';

interface UseAudioPlaybackReturn {
  audioUrl: string | null;
  isLoading: boolean;
  error: string | null;
  loadAudioFile: (id: string) => Promise<void>;
  clearAudio: () => void;
}

/**
 * Hook to manage audio file playback from IndexedDB
 * Handles file retrieval and object URL lifecycle
 */
export function useAudioPlayback(): UseAudioPlaybackReturn {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Load an audio file from IndexedDB and create object URL
   */
  const loadAudioFile = useCallback(async (id: string) => {
    setIsLoading(true);
    setError(null);

    try {
      // Revoke previous URL if exists
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }

      // Retrieve file from IndexedDB
      const file = await audioStorage.getAudioFile(id);

      if (!file) {
        throw new Error('Audio file not found in storage');
      }

      // Create new object URL
      const url = URL.createObjectURL(file);
      setAudioUrl(url);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load audio';
      setError(errorMessage);
      console.error('Error loading audio file:', err);
    } finally {
      setIsLoading(false);
    }
  }, [audioUrl]);

  /**
   * Clear current audio and revoke URL
   */
  const clearAudio = useCallback(() => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    setError(null);
  }, [audioUrl]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  return {
    audioUrl,
    isLoading,
    error,
    loadAudioFile,
    clearAudio,
  };
}