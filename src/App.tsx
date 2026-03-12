import React, { useEffect, useState, useRef, useCallback } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { useSimilaritySearch } from './hooks/useSimilaritySearch';
import type { AnalyzedTrack } from './types/audio';
import type { TrackDisplay } from './utils/parseTrackDisplay';
import type { FeatureVector } from './workers/featureExtraction.types';
import type { SimilarityResult } from './services/similarityService';
import { audioStorage } from './services/audioStorageService';
import { PrivacyNotice } from './components/PrivacyNotice';
import { validateAudioFile } from './utils/fileValidation';
import { Header, Sidebar, MainContent } from './components';
import { parseTrackDisplay } from './utils/parseTrackDisplay';

import './index.css';

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

function App() {
  const {
    isSearching,
    results: similarityResults,
    featureVector: referenceFeatureVector,
    duration: referenceDuration,
    findSimilar,
    clearResults,
  } = useSimilaritySearch();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [trackHistory, setTrackHistory] = useState<AnalyzedTrack[]>([]);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [storageStats, setStorageStats] = useState({ count: 0, size: 0 });
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [storageFull, setStorageFull] = useState(false);
  const [activeTrack, setActiveTrack] = useState<{
    type: 'reference' | 'match';
    file: File | string;
    features?: FeatureVector;
    metadata: TrackDisplay;
  } | null>(null);
  const [selectedMatchFile, setSelectedMatchFile] = useState<string | undefined>(undefined);
  const [historyFetchFailed, setHistoryFetchFailed] = useState(false); 

  const storedTrackIds = useRef<Set<string>>(new Set());

  const handleShowReference = (track: { file: File; features?: FeatureVector; metadata: TrackDisplay }) => {
    setActiveTrack({
      type: 'reference',
      file: track.file,
      features: track.features,
      metadata: track.metadata
    });
  };

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

  // Add track to history when feature extraction completes
  useEffect(() => {
    if (!referenceFeatureVector || !selectedFile) return;

    const trackId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    if (storedTrackIds.current.has(trackId)) return;
    storedTrackIds.current.add(trackId);

    const newTrack: AnalyzedTrack = {
      id: trackId,
      fileName: selectedFile.name,
      fileSize: selectedFile.size,
      duration: referenceDuration ?? undefined,
      timestamp: Date.now(),
      hasStoredAudio: storageAvailable,
      analyzedAt: Date.now()
    };

    if (storageAvailable) {
      audioStorage.storeTrack(trackId, selectedFile, newTrack)
        .then(() => updateStats())
        .catch((err: Error) => {
          storedTrackIds.current.delete(trackId);
          setTrackHistory(prev =>
            prev.map(t => t.id === trackId ? { ...t, hasStoredAudio: false } : t)
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
    setSelectedTrackId(trackId);
  }, [referenceFeatureVector, selectedFile, storageAvailable, updateStats, referenceDuration]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateAudioFile(file);
    if (!validation.isValid) {
      toast.error(validation.error || 'Invalid file', { duration: 5000 });
      e.target.value = '';
      return;
    }

    const metadata: TrackDisplay = {
      title: file.name,
      subtitle: 'Your reference',
      source: 'Uploaded file'
    };

    setSelectedFile(file);
    setSelectedTrackId(null);
    setActiveTrack({ type: 'reference', file, metadata });

    findSimilar(file);
  };

  const handleFileDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    const validation = validateAudioFile(file);
    if (!validation.isValid) {
      toast.error(validation.error || 'Invalid file', { duration: 5000 });
      return;
    }

    const metadata: TrackDisplay = {
      title: file.name,
      subtitle: 'Your reference',
      source: 'Uploaded file'
    };

    setSelectedFile(file);
    setSelectedTrackId(null);
    setActiveTrack({ type: 'reference', file, metadata });

    findSimilar(file);
  };

  const handleClearFile = () => {
    setSelectedFile(null);
    setSelectedTrackId(null);
    setActiveTrack(null);
    clearResults();
    setHistoryFetchFailed(false);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
  };

  const handleSelectTrack = async (id: string) => {
    clearResults();
    setSelectedTrackId(id);
    setSelectedFile(null);
    setActiveTrack(null);
    setHistoryFetchFailed(false);

    const track = trackHistory.find(t => t.id === id);
    if (!track?.hasStoredAudio) {
      setHistoryFetchFailed(true);
      return;
    }

    try {
      const file = await audioStorage.getAudioFile(id);
      if (file) {
        const metadata: TrackDisplay = {
          title: track.fileName,
          subtitle: 'From history',
          source: 'Stored file'
        };
        setActiveTrack({ type: 'reference', file, metadata });
        findSimilar(file);
      } else {
        setHistoryFetchFailed(true);
      }
    } catch (err) {
      console.error('Failed to load history track:', err);
      setHistoryFetchFailed(true);
    }
  };

  const removeTrack = async (id: string) => {
    try {
      await audioStorage.deleteTrack(id);
      setTrackHistory(prev => prev.filter(t => t.id !== id));
      if (selectedTrackId === id) {
        setSelectedTrackId(null);
        setSelectedFile(null);
        setActiveTrack(null);
      }
      await updateStats();
      setStorageFull(false);
      setHistoryFetchFailed(false);
      toast.success('Track removed', { duration: 2000 });
    } catch (err) {
      console.error('Failed to delete track:', err);
      toast.error('Failed to remove track');
    }
  };

  const clearAllTracks = async () => {
    if (!window.confirm('Clear all tracks? This cannot be undone.')) return;
    try {
      const count = trackHistory.length;
      await audioStorage.clearAllTracks();
      setTrackHistory([]);
      setSelectedTrackId(null);
      setSelectedFile(null);
      setActiveTrack(null);
      await updateStats();
      setStorageFull(false);
      setHistoryFetchFailed(false)
      clearResults();
      toast.success(`Cleared ${count} track${count !== 1 ? 's' : ''}`, { duration: 2000 });
    } catch (err) {
      console.error('Failed to clear all:', err);
      toast.error('Failed to clear tracks');
    }
  };

  const handleSelectMatch = (result: SimilarityResult) => {
    const baseUrl = process.env.REACT_APP_R2_PUBLIC_URL || 'https://pub-2014bbd27fde402e8d8cd1a67fe4fbcd.r2.dev';
    const r2Key = result.file.replace(/^\.\//, '').replace(/^data\//, '');
    const encodedKey = r2Key.split('/').map(segment => encodeURIComponent(segment)).join('/');
    const r2Url = `${baseUrl}/${encodedKey}`;

    setActiveTrack({
      type: 'match',
      file: r2Url,
      features: result.features ?? undefined,
      metadata: parseTrackDisplay(result.file)
    });

    setSelectedMatchFile(result.file);
  };

  const handleClearActiveTrack = () => {
    setActiveTrack(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-black text-white p-4 sm:p-8">
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: '#1f2937',
            color: '#fff',
            border: '1px solid #374151',
          },
          success: {
            iconTheme: { primary: '#10b981', secondary: '#fff' },
          },
          error: {
            iconTheme: { primary: '#ef4444', secondary: '#fff' },
          },
        }}
      />
      <div className="max-w-6xl mx-auto w-full">
        <Header />
        <PrivacyNotice />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          <MainContent
            selectedFile={selectedFile}
            selectedTrackId={selectedTrackId}
            trackHistory={trackHistory}
            onFileChange={handleFileChange}
            onFileDrop={handleFileDrop}
            onClearFile={handleClearFile}
            similarityResults={similarityResults}
            isSearching={isSearching}
            activeTrack={activeTrack}
            referenceFeatures={referenceFeatureVector}
            featureVector={referenceFeatureVector}
            onSelectMatch={handleSelectMatch}
            onClearActiveTrack={handleClearActiveTrack}
            onShowReference={handleShowReference}
            selectedMatchFile={selectedMatchFile}
            historyFetchFailed={historyFetchFailed}
          />

          <Sidebar
            trackHistory={trackHistory}
            selectedTrackId={selectedTrackId}
            onSelectTrack={handleSelectTrack}
            onRemoveTrack={removeTrack}
            onClearAll={clearAllTracks}
            storageStats={storageStats}
            storageFull={storageFull}
            similarityResults={similarityResults}
            isSearching={isSearching}
            onSelectMatch={handleSelectMatch}
            activeMatchId={selectedMatchFile}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
