import React, { useEffect, useState, useRef } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { useScenePrediction } from './hooks/useScenePrediction';
import type { AnalyzedTrack, PredictionResult } from './types/audio';
import { audioStorage } from './services/audioStorageService';
import { PrivacyNotice } from './components/PrivacyNotice';
import { validateAudioFile } from './utils/fileValidation';
import { Header, ModelStatus, Sidebar, MainContent } from './components';
import './index.css';

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
  const lastToastResultRef = useRef<PredictionResult | null>(null);
  const storedTrackIds = useRef<Set<string>>(new Set());

  const displayResult: PredictionResult | undefined = selectedTrackId 
    ? trackHistory.find(t => t.id === selectedTrackId)?.result ?? undefined
    : result ?? undefined;

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
        // Initialize IndexedDB
        await audioStorage.init();

        // Clear old localStorage data (migration cleanup)
        localStorage.removeItem('sceneSync_trackHistory');

        // Load track history from IndexedDB
        const storedTracks = await audioStorage.getAllTracks();
        
        // Deduplicate by ID (in case of corruption)
        const uniqueTracks = storedTracks.filter((track, index, self) =>
          index === self.findIndex((t) => t.id === track.id)
        );
        
        setTrackHistory(uniqueTracks);

        const descriptionsResponse = await fetch('/scene_descriptions.json');
        const descriptions = await descriptionsResponse.json();
        setSceneDescriptions(descriptions);
        await initializeModel();
      } catch (err) {
        console.error('Failed to initialize:', err);
      }
    };
    init();
  }, [initializeModel]);

  // Show error toast when model loading fails
  useEffect(() => {
    if (error && error.type === 'model') {
      toast.error(error.message, {
        duration: 5000,
      });
    }
  }, [error]);

  // Add track to history when result updates
  useEffect(() => {
    if (result && selectedFile) {
      // Skip if we've already processed this exact result object
      if (lastToastResultRef.current === result) {
        return;
      }

      // Generate truly unique ID with timestamp + random
      const trackId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Skip if we've already stored this ID (extra safety)
      if (storedTrackIds.current.has(trackId)) {
        return;
      }

      // Mark this ID and result as processed immediately
      storedTrackIds.current.add(trackId);
      lastToastResultRef.current = result;

      const newTrack: AnalyzedTrack = {
        id: trackId,
        fileName: selectedFile.name,
        fileSize: selectedFile.size,
        duration: result.audioDuration,
        timestamp: Date.now(),
        result: result,
        hasStoredAudio: true,
        prediction: result,
        features: result.features,
        analyzedAt: Date.now(),
      };

      // Store complete track (audio + metadata) in IndexedDB
      audioStorage.storeTrack(trackId, selectedFile, newTrack)
        .then(() => {
          console.log('Track stored successfully:', trackId);
        })
        .catch((err: Error) => {
          console.error('Failed to store track:', err);
          // Remove from stored set on failure
          storedTrackIds.current.delete(trackId);
          // Update the track in history to reflect storage failure
          setTrackHistory(prev => 
            prev.map(t => t.id === trackId ? { ...t, hasStoredAudio: false } : t)
          );
        });
      
      // Add to state
      setTrackHistory(prev => [newTrack, ...prev]);
      
      // Show toast
      toast.success('Analysis complete!', {
        duration: 3000,
      });
      
      setSelectedTrackId(trackId);
    }
  }, [result, selectedFile]);

  // Update storage stats when history changes
  useEffect(() => {
    const updateStats = async () => {
      try {
        const count = await audioStorage.getStoredFileCount();
        const size = await audioStorage.getStorageSize();
        setStorageStats({ count, size });
      } catch (err) {
        console.error('Failed to get storage stats:', err);
      }
    };

    updateStats();
  }, [trackHistory]);

  // File upload handler with validation
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file before processing
    const validation = validateAudioFile(file);
    
    if (!validation.isValid) {
      toast.error(validation.error || 'Invalid file', {
        duration: 5000,
      });
      // Reset input so same file can be selected again
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

    // Validate file before processing
    const validation = validateAudioFile(file);
    
    if (!validation.isValid) {
      toast.error(validation.error || 'Invalid file', {
        duration: 5000,
      });
      return;
    }

    setSelectedFile(file);
    setSelectedTrackId(null);
    await predictSceneType(file);
  };

  // Retry prediction after error
  const handleRetry = () => {
    if (selectedFile) {
      retryPrediction(selectedFile);
    }
  };

  // Clear file handler
  const handleClearFile = () => {
    setSelectedFile(null);
    setSelectedTrackId(null);
    clearError();
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
  };

  // Track selection handler
  const handleSelectTrack = (id: string) => {
    setSelectedTrackId(id);
    setSelectedFile(null);
    clearError();
  };

  // Remove track handler
  const removeTrack = async (id: string) => {
    try {
      // Delete from IndexedDB
      await audioStorage.deleteTrack(id);
      
      // Update state
      setTrackHistory(prev => prev.filter(t => t.id !== id));
      if (selectedTrackId === id) {
        setSelectedTrackId(null);
        setSelectedFile(null);
      }
      toast.success('Track removed', {
        duration: 2000,
      });
    } catch (err) {
      console.error('Failed to delete track:', err);
      toast.error('Failed to remove track');
    }
  };

  // Clear all tracks handler
  const clearAllTracks = async () => {
    if (!window.confirm('Clear all tracks? This cannot be undone.')) {
      return;
    }

    try {
      const count = trackHistory.length;
      await audioStorage.clearAllTracks();
      setTrackHistory([]);
      setSelectedTrackId(null);
      setSelectedFile(null);
      clearError();
      toast.success(`Cleared ${count} track${count !== 1 ? 's' : ''}`, {
        duration: 2000,
      });
    } catch (err) {
      console.error('Failed to clear all:', err);
      toast.error('Failed to clear tracks');
    }
  };

  // Retry model initialization
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
            iconTheme: {
              primary: '#10b981',
              secondary: '#fff',
            },
          },
          error: {
            iconTheme: {
              primary: '#ef4444',
              secondary: '#fff',
            },
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

        {/* Privacy Notice */}
        <PrivacyNotice />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
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
          />

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
        </div>

        {/* Debug Info */}
        {displayResult && (
          <div 
            className={`
              mt-6 bg-gray-800/30 p-4 rounded-lg border border-gray-700
              transition-all duration-200 ease-out
              ${showResults ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}
            `}
          >
            <details>
              <summary className="cursor-pointer text-sm text-gray-400 hover:text-gray-300">
                Debug: View Extracted Features
              </summary>
              <div className="mt-3 text-xs text-gray-500 font-mono max-h-40 overflow-y-auto">
                {displayResult.features.map((val, idx) => (
                  <div key={idx}>Feature {idx}: {val.toFixed(4)}</div>
                ))}
              </div>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;