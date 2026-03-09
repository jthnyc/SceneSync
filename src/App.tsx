import React, { useEffect, useState, useRef, useCallback } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { useScenePrediction } from './hooks/useScenePrediction';
import { useSimilaritySearch } from './hooks/useSimilaritySearch';
import type { AnalyzedTrack, PredictionResult } from './types/audio';
import type { TrackDisplay } from './utils/parseTrackDisplay';
import type { FeatureVector } from './workers/featureExtraction.types';
import type { SimilarityResult } from './services/similarityService';
import { audioStorage } from './services/audioStorageService';
import { PrivacyNotice } from './components/PrivacyNotice';
import { validateAudioFile } from './utils/fileValidation';
import { Header, ModelStatus, Sidebar, MainContent } from './components';
import { parseTrackDisplay } from './utils/parseTrackDisplay';
import { flattenToFeatureVector } from './utils/featureVectorUtils';

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

  const {
    isSearching,
    results: similarityResults,
    featureVector: referenceFeatureVector,
    findSimilar,
  } = useSimilaritySearch();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sceneDescriptions, setSceneDescriptions] = useState<{ [key: string]: string }>({});
  const [trackHistory, setTrackHistory] = useState<AnalyzedTrack[]>([]);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [storageStats, setStorageStats] = useState({ count: 0, size: 0 });
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [storageFull, setStorageFull] = useState(false);
  const [activeTrack, setActiveTrack] = useState<{
    type: 'reference' | 'match';
    file: File | string;
    features?: FeatureVector;
    metadata: TrackDisplay;
  } | null>(null);
  const [referenceFeatures, setReferenceFeatures] = useState<FeatureVector | null>(null);
  const [selectedMatchFile, setSelectedMatchFile] = useState<string | undefined>(undefined);
  
  const lastToastResultRef = useRef<PredictionResult | null>(null);
  const storedTrackIds = useRef<Set<string>>(new Set());

  const displayResult: PredictionResult | undefined = selectedTrackId 
    ? trackHistory.find(t => t.id === selectedTrackId)?.result ?? undefined
    : result ?? undefined;

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

  // Animation timing
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

        const descriptionsResponse = await fetch('/scene_descriptions.json');
        const descriptions = await descriptionsResponse.json();
        setSceneDescriptions(descriptions);
        await initializeModel();
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

  // Show error toast on model failure
  useEffect(() => {
    if (error && error.type === 'model') {
      toast.error(error.message, { duration: 5000 });
    }
  }, [error]);

  // Set active track when result comes in
  useEffect(() => {
    if (result && selectedFile && !activeTrack) {
      if (result.features && Array.isArray(result.features)) {
        const structuredFeatures = flattenToFeatureVector(result.features);
        
        if (structuredFeatures) {
          const metadata: TrackDisplay = {
            title: selectedFile.name,
            subtitle: 'Your reference',
            source: 'Uploaded file'
          };
          
          setReferenceFeatures(structuredFeatures);
          setActiveTrack({
            type: 'reference',
            file: selectedFile,
            features: structuredFeatures,
            metadata
          });
        }
      }
    }
  }, [result, selectedFile, activeTrack]);

  // Add track to history
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
            updateStats();
          })
          .catch((err: Error) => {
            console.error('Failed to store track:', err);
            storedTrackIds.current.delete(trackId);
            setTrackHistory(prev =>
              prev.map(t => t.id === trackId ? { ...t, hasStoredAudio: false } : t)
            );

            if (isQuotaError(err)) {
              setStorageFull(true);
              toast.error('Storage full — clear some tracks to save new ones.', {
                duration: 6000,
              });
            } else {
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

  // File upload handler
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
    setActiveTrack(null);
    
    await predictSceneType(file);
    findSimilar(file);
  };

  // Drag and drop handler
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
    setActiveTrack(null);
    
    await predictSceneType(file);
    findSimilar(file);
  };

  const handleRetry = () => {
    if (selectedFile) retryPrediction(selectedFile);
  };

  const handleClearFile = () => {
    setSelectedFile(null);
    setSelectedTrackId(null);
    setActiveTrack(null);
    setReferenceFeatures(null);
    clearError();
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
  };

  const handleSelectTrack = (id: string) => {
    setSelectedTrackId(id);
    setSelectedFile(null);
    setActiveTrack(null);
    clearError();
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
      setReferenceFeatures(null);
      clearError();
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

  const handleSelectMatch = (result: SimilarityResult) => {
    const baseUrl = process.env.REACT_APP_R2_PUBLIC_URL || 'https://pub-2014bbd27fde402e8d8cd1a67fe4fbcd.r2.dev';
    
    // Strip leading "./" or "data/" to get the R2 key
    // FMA:     "./data/fma_small/141/141300.mp3" → "fma_small/141/141300.mp3"
    // Musopen: "data/musopen/Musopen DVD/..." → "musopen/Musopen DVD/..."
    const r2Key = result.file.replace(/^\.\//, '').replace(/^data\//, '');
    
    // Encode each path segment individually so slashes are preserved
    const encodedKey = r2Key.split('/').map(segment => encodeURIComponent(segment)).join('/');
    const r2Url = `${baseUrl}/${encodedKey}`;
    
    const features = result.features ?? undefined;
    
    setActiveTrack({
      type: 'match',
      file: r2Url,
      features,
      metadata: parseTrackDisplay(result.file)
    });
    
    setSelectedMatchFile(result.file);
  };

  const handleClearActiveTrack = () => {
    setActiveTrack(null);
    // Don't clear referenceFeatures — keep for comparison
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
            similarityResults={similarityResults}
            isSearching={isSearching}
            activeTrack={activeTrack}
            referenceFeatures={referenceFeatures}
            featureVector={referenceFeatureVector}
            onSelectMatch={handleSelectMatch}
            onClearActiveTrack={handleClearActiveTrack}
            onShowReference={handleShowReference}
            selectedMatchFile={selectedMatchFile}
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