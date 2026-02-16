import React, { useEffect, useState, useRef, useCallback } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { useScenePrediction } from './hooks/useScenePrediction';
import type { AnalyzedTrack, PredictionResult } from './types/audio';
import { audioStorage } from './services/audioStorageService';
import { PrivacyNotice } from './components/PrivacyNotice';
import { validateAudioFile } from './utils/fileValidation';
import { Header, ModelStatus, Sidebar, MainContent } from './components';
import './index.css';

// Detects Safari private browsing mode, which blocks IndexedDB entirely
function isStorageUnavailable(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return (
    err.name === 'InvalidStateError' ||
    err.name === 'SecurityError' ||
    err.message.includes('The operation is insecure') ||
    err.message.includes('storage')
  );
}

// Detects browser storage quota exceeded errors
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
    isLoading,
    isPredicting,
    error,
    result,
    initializeModel,
    predictSceneType,
    isModelLoaded,
    progressState,
    clearError,
    retryPrediction,
  } = useScenePrediction();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sceneDescriptions, setSceneDescriptions] = useState<{ [key: string]: string }>({});
  const [trackHistory, setTrackHistory] = useState<AnalyzedTrack[]>([]);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [storageStats, setStorageStats] = useState({ count: 0, size: 0 });
  const [storageAvailable, setStorageAvailable] = useState(true);
  // Drives the red "storage full" state in StorageInfo — set on quota error,
  // cleared when the user removes tracks, freeing space
  const [storageFull, setStorageFull] = useState(false);
  const lastToastResultRef = useRef<PredictionResult | null>(null);
  const storedTrackIds = useRef<Set<string>>(new Set());

  const displayResult: PredictionResult | undefined = selectedTrackId 
    ? trackHistory.find(t => t.id === selectedTrackId)?.result ?? undefined
    : result ?? undefined;

  // Stable function — called directly after storage writes/deletes complete
  // rather than relying on trackHistory changes, which fire before writes commit
  const updateStats = useCallback(async () => {
    if (!storageAvailable) return;
    try {
      const stats = await audioStorage.getStorageStats();
      setStorageStats(stats);
    } catch (err) {
      console.error('Failed to get storage stats:', err);
    }
  }, [storageAvailable]);

  // Only trigger fade-in animation when new prediction completes
  useEffect(() => {
    if (result && !selectedTrackId) {
      setShowResults(false);
      const timer = setTimeout(() => setShowResults(true), 10);
      return () => clearTimeout(timer);
    } else if (!displayResult) {
      setShowResults(false);
    } else if (selectedTrackId) {
      setShowResults(true);
    }
  }, [result, selectedTrackId, displayResult]);

  // Initialize model, IndexedDB, and load descriptions on mount
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

        const descriptionsResponse = await fetch('/scene_descriptions.json');
        const descriptions = await descriptionsResponse.json();
        setSceneDescriptions(descriptions);
        await initializeModel();

        // Initial stats load after DB is ready
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
  }, [initializeModel, updateStats]);

  // Show error toast when model loading fails
  useEffect(() => {
    if (error && error.type === 'model') {
      toast.error(error.message, { duration: 5000 });
    }
  }, [error]);

  // Add track to history when result updates
  useEffect(() => {
    if (result && selectedFile) {
      if (lastToastResultRef.current === result) return;

      const trackId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      if (storedTrackIds.current.has(trackId)) return;

      storedTrackIds.current.add(trackId);
      lastToastResultRef.current = result;

      const newTrack: AnalyzedTrack = {
        id: trackId,
        fileName: selectedFile.name,
        fileSize: selectedFile.size,
        duration: result.audioDuration,
        timestamp: Date.now(),
        result: result,
        hasStoredAudio: storageAvailable,
        prediction: result,
        features: result.features,
        analyzedAt: Date.now()
      };

      if (storageAvailable) {
        audioStorage.storeTrack(trackId, selectedFile, newTrack)
          .then(() => {
            console.log('Track stored successfully:', trackId);
            // Update stats AFTER the write commits — fixes the Safari count delay
            updateStats();
          })
          .catch((err: Error) => {
            console.error('Failed to store track:', err);
            storedTrackIds.current.delete(trackId);
            setTrackHistory(prev =>
              prev.map(t => t.id === trackId ? { ...t, hasStoredAudio: false } : t)
            );

            if (isQuotaError(err)) {
              // Quota errors are actionable — tell the user exactly what to do
              setStorageFull(true);
              toast.error('Storage full — clear some tracks to save new ones.', {
                duration: 6000,
              });
            } else {
              // Generic failure — analysis still visible this session
              toast.error('Failed to save track to storage. Analysis results are still visible this session.', {
                duration: 5000,
              });
            }
          });
      }

      setTrackHistory(prev => [newTrack, ...prev]);
      toast.success('Analysis complete!', { duration: 3000 });
      setSelectedTrackId(trackId);
    }
  }, [result, selectedFile, storageAvailable, updateStats]);

  // File upload handler with validation
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const validation = validateAudioFile(file);
    if (!validation.isValid) {
      toast.error(validation.error || 'Invalid file', { duration: 5000 });
      e.target.value = '';
      return;
    }
    setSelectedFile(file);
    setSelectedTrackId(null);
    await predictSceneType(file);
  };

  // Drag and drop handler with validation
  const handleFileDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const validation = validateAudioFile(file);
    if (!validation.isValid) {
      toast.error(validation.error || 'Invalid file', { duration: 5000 });
      return;
    }
    setSelectedFile(file);
    setSelectedTrackId(null);
    await predictSceneType(file);
  };

  const handleRetry = () => {
    if (selectedFile) retryPrediction(selectedFile);
  };

  const handleClearFile = () => {
    setSelectedFile(null);
    setSelectedTrackId(null);
    clearError();
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
  };

  const handleSelectTrack = (id: string) => {
    setSelectedTrackId(id);
    setSelectedFile(null);
    clearError();
  };

  const removeTrack = async (id: string) => {
    try {
      await audioStorage.deleteTrack(id);
      setTrackHistory(prev => prev.filter(t => t.id !== id));
      if (selectedTrackId === id) {
        setSelectedTrackId(null);
        setSelectedFile(null);
      }
      // Update stats after delete commits
      await updateStats();
      // If storage was full, a deletion frees space — clear the warning
      setStorageFull(false);
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
      clearError();
      // Update stats after clear commits and reset full state
      await updateStats();
      setStorageFull(false);
      toast.success(`Cleared ${count} track${count !== 1 ? 's' : ''}`, { duration: 2000 });
    } catch (err) {
      console.error('Failed to clear all:', err);
      toast.error('Failed to clear tracks');
    }
  };

  const handleRetryModelInit = async () => {
    await initializeModel();
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
        
        <ModelStatus
          isLoading={isLoading}
          isModelLoaded={isModelLoaded}
          error={error?.message ?? null}
          onRetry={handleRetryModelInit}
        />

        <PrivacyNotice />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          <MainContent
            selectedFile={selectedFile}
            selectedTrackId={selectedTrackId}
            trackHistory={trackHistory}
            displayResult={displayResult}
            isPredicting={isPredicting}
            isLoading={isLoading}
            hasError={error !== null && !isModelLoaded}
            showResults={showResults}
            onFileChange={handleFileChange}
            onFileDrop={handleFileDrop}
            onClearFile={handleClearFile}
            error={error}
            onRetry={handleRetry}
            onDismissError={clearError}
          />

          <Sidebar
            displayResult={displayResult}
            isPredicting={isPredicting}
            trackHistory={trackHistory}
            selectedTrackId={selectedTrackId}
            sceneDescriptions={sceneDescriptions}
            showResults={showResults}
            progress={progressState.progress}
            progressStage={progressState.stage}
            onSelectTrack={handleSelectTrack}
            onRemoveTrack={removeTrack}
            onClearAll={clearAllTracks}
            storageStats={storageStats}
            storageFull={storageFull}
          />
        </div>
      </div>
    </div>
  );
}

export default App;