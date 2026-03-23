// ── useTrackHistory ───────────────────────────────────────────────────────
// Owns all track history state and IndexedDB persistence.
// App.tsx calls this hook and passes results down as props.

import { useState, useCallback, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { audioStorage } from '../services/audioStorageService';
import type { AnalyzedTrack } from '../types/audio';
import type { FeatureVector } from '../workers/featureExtraction.types';

function isStorageUnavailable(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return (
    err.name === 'InvalidStateError' ||
    err.name === 'SecurityError' ||
    err.message.includes('The operation is insecure') ||
    err.message.includes('storage')
  );
}

function isQuotaError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return (
    err.name === 'QuotaExceededError' ||
    err.message.includes('QuotaExceededError') ||
    err.message.includes('quota')
  );
}

export const useTrackHistory = () => {
  const [trackHistory, setTrackHistory] = useState<AnalyzedTrack[]>([]);
  const [storageStats, setStorageStats] = useState({ count: 0, size: 0 });
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [storageFull, setStorageFull] = useState(false);

  // Dedup guard: prevents duplicate addTrack calls from React 18 StrictMode
  // double-invoking effects. Not an ID registry — only checked during addTrack.
  const storedTrackIds = useRef<Set<string>>(new Set());

  const updateStats = useCallback(async () => {
    if (!storageAvailable) return;
    try {
      const stats = await audioStorage.getStorageStats();
      setStorageStats(stats);
    } catch (err) {
      console.error('Failed to get storage stats:', err);
    }
  }, [storageAvailable]);

  // Initialize on mount
  useEffect(() => {
    const init = async () => {
      try {
        await audioStorage.init();
        localStorage.removeItem('sceneSync_trackHistory');
        const storedTracks = await audioStorage.getAllTracks();
        const uniqueTracks = storedTracks.filter((track, index, self) =>
          index === self.findIndex((t) => t.id === track.id)
        );
        setTrackHistory(uniqueTracks);
        await updateStats();
      } catch (err) {
        console.error('Failed to initialize:', err);
        if (isStorageUnavailable(err)) {
          setStorageAvailable(false);
          toast('Storage unavailable — results won\'t be saved this session. Try a non-private window.', {
            icon: '🔒',
            duration: 8000,
            style: {
              background: '#1f2937',
              color: '#fbbf24',
              border: '1px solid #92400e',
            },
          });
        } else {
          toast.error('Failed to initialize storage. Some features may be unavailable.', {
            duration: 5000,
          });
        }
      }
    };
    init();
  }, [updateStats]);

  const addTrack = useCallback(async (
    file: File,
    featureVector: FeatureVector,
    duration: number | null
  ): Promise<string | null> => {
    const trackId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    if (storedTrackIds.current.has(trackId)) return null;
    storedTrackIds.current.add(trackId);

    const newTrack: AnalyzedTrack = {
      id: trackId,
      fileName: file.name,
      fileSize: file.size,
      duration: duration ?? undefined,
      timestamp: Date.now(),
      hasStoredAudio: storageAvailable,
      analyzedAt: Date.now(),
    };

    if (storageAvailable) {
      audioStorage.storeTrack(trackId, file, newTrack)
      // Two-step write: track shell is stored first (storeTrack), then
      // featureVector is patched in (updateTrackData). Not atomic — but
      // acceptable because the feature vector is also held in React state.
        .then(() => {
          audioStorage.updateTrackData(trackId, { featureVector });
          setTrackHistory(prev =>
            prev.map(t => t.id === trackId
              ? { ...t, featureVector }
              : t
            )
          );
          updateStats();
        })
        .catch((err: Error) => {
          storedTrackIds.current.delete(trackId);
          setTrackHistory(prev =>
            prev.map(t => t.id === trackId
              ? { ...t, hasStoredAudio: false }
              : t
            )
          );
          if (isQuotaError(err)) {
            setStorageFull(true);
            toast.error('Storage full — hover over tracks to remove them.', { duration: 6000 });
          } else {
            toast.error('Failed to save track to storage.', { duration: 5000 });
          }
        });
    }

    setTrackHistory(prev => [newTrack, ...prev]);
    toast.success('Analysis complete!', { duration: 3000 });
    return trackId;
  }, [storageAvailable, updateStats]);

  const updateTrack = useCallback(async (
    id: string,
    partial: Partial<AnalyzedTrack>
  ): Promise<void> => {
    try {
      await audioStorage.updateTrackData(id, partial);
      setTrackHistory(prev =>
        prev.map(t => t.id === id ? { ...t, ...partial } : t)
      );
    } catch (err) {
      console.error('Failed to update track:', err);
    }
  }, []);

  const removeTrack = useCallback(async (id: string): Promise<void> => {
    try {
      await audioStorage.deleteTrack(id);
      setTrackHistory(prev => prev.filter(t => t.id !== id));
      await updateStats();
      setStorageFull(false);
      toast.success('Track removed', { duration: 2000 });
    } catch (err) {
      console.error('Failed to delete track:', err);
      toast.error('Failed to remove track');
    }
  }, [updateStats]);

  const clearAllTracks = useCallback(async (): Promise<void> => {
    if (!window.confirm('Clear all tracks? This cannot be undone.')) return;
    try {
      const count = trackHistory.length;
      await audioStorage.clearAllTracks();
      setTrackHistory([]);
      await updateStats();
      setStorageFull(false);
      toast.success(`Cleared ${count} track${count !== 1 ? 's' : ''}`, { duration: 2000 });
    } catch (err) {
      console.error('Failed to clear all:', err);
      toast.error('Failed to clear tracks');
    }
  }, [trackHistory.length, updateStats]);

  const getTrack = useCallback((id: string): AnalyzedTrack | undefined => {
    return trackHistory.find(t => t.id === id);
  }, [trackHistory]);

  return {
    trackHistory,
    storageStats,
    storageAvailable,
    storageFull,
    addTrack,
    updateTrack,
    removeTrack,
    clearAllTracks,
    getTrack,
  };
};