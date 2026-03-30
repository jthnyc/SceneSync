import React, { useState, useCallback, useRef } from 'react';
import { Toaster, toast } from 'react-hot-toast';
import { useSimilaritySearch } from './hooks/useSimilaritySearch';
import { useTrackHistory } from './hooks/useTrackHistory';
import { useExplanationCache } from './hooks/useExplanationCache';
import { useFileHandler } from './hooks/useFileHandler';
import type { TrackDisplay } from './utils/parseTrackDisplay';
import type { FeatureVector } from './workers/featureExtraction.types';
import type { SimilarityResult } from './services/similarityService';
import { audioStorage } from './services/audioStorageService';
import { PrivacyNotice } from './components/PrivacyNotice';
import { Header, Sidebar, MainContent } from './components';
import { parseTrackDisplay } from './utils/parseTrackDisplay';
import type { EntryPoint } from './config/entryPoints';

import './index.css';

// ── App ───────────────────────────────────────────────────────────────────
// Composition layer only — wires hooks together and passes props down.
// No business logic lives here. Each concern is owned by a dedicated hook:
//   useFileHandler        → file selection, validation, post-extraction chain
//   useTrackHistory       → track history state, IndexedDB persistence
//   useExplanationCache   → explanation fetching, caching, LLM API layer
//   useSimilaritySearch   → feature extraction, cosine similarity search

function App() {
  const playerRef = useRef<HTMLDivElement>(null);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [activeTrack, setActiveTrack] = useState<{
    type: 'reference' | 'match';
    file: File | string;
    features?: FeatureVector;
    metadata: TrackDisplay;
  } | null>(null);
  const [selectedMatchFile, setSelectedMatchFile] = useState<string | undefined>(undefined);
  const [historyFetchFailed, setHistoryFetchFailed] = useState(false);
  const [loadingEntryPoint, setLoadingEntryPoint] = useState<string | null>(null);

  const {
    isSearching,
    results: similarityResults,
    featureVector: referenceFeatureVector,
    duration: referenceDuration,
    progressState,
    findSimilar,
    findSimilarFromVector,
    clearResults,
  } = useSimilaritySearch();

  const {
    trackHistory,
    storageStats,
    storageAvailable,
    storageFull,
    addTrack,
    updateTrack,
    removeTrack,
    clearAllTracks,
    getTrack,
  } = useTrackHistory();

  const {
    referenceExplanation,
    matchExplanation,
    isExplaining: isExplainingTrack,
    error: explanationError,
    explainReference,
    explainMatchTrack,
    clearExplanations,
    restoreReferenceExplanation,
  } = useExplanationCache({
    selectedTrackId,
    activeMatchFile: selectedMatchFile ?? null,
    getTrack,
    updateTrack,
    storageAvailable,
  });

  const handleFileReady = useCallback((track: { file: File; features?: FeatureVector; metadata: TrackDisplay }) => {
    setSelectedTrackId(null);
    setActiveTrack({ type: 'reference', file: track.file, metadata: track.metadata });
  }, []);

  const handleTrackAdded = useCallback((trackId: string) => {
    setSelectedTrackId(trackId);
  }, []);

  const { selectedFile, handleFile, handleFileChange, handleFileDrop, clearFile } = useFileHandler({
    referenceFeatureVector,
    referenceDuration,
    findSimilar,
    addTrack,
    explainReference,
    onFileReady: handleFileReady,
    onTrackAdded: handleTrackAdded,
  });

  const handleEntryPointSelect = useCallback(async (entryPoint: EntryPoint) => {
    setLoadingEntryPoint(entryPoint.zone);
    try {
      const response = await fetch(`/api/fetch-audio?path=${encodeURIComponent(entryPoint.r2Path)}`);
      if (!response.ok) throw new Error(`Failed to fetch entry point: ${response.status}`);
      const blob = await response.blob();
      const file = new File([blob], entryPoint.fileName, { type: 'audio/mpeg' });
      handleFile(file);
    } catch (err) {
      console.error('Entry point fetch failed:', err);
      console.error('URL attempted:', `${process.env.REACT_APP_R2_PUBLIC_URL}/${entryPoint.r2Path}`);
      toast.error('Could not load sample track. Please try uploading your own file.');
    } finally {
      setLoadingEntryPoint(null);
    }
  }, [handleFile]);

  const handleShowReference = (track: { file: File; features?: FeatureVector; metadata: TrackDisplay }) => {
    setActiveTrack({
      type: 'reference',
      file: track.file,
      features: track.features,
      metadata: track.metadata,
    });
  };

  const handleClearFile = () => {
    clearFile();
    setSelectedTrackId(null);
    setActiveTrack(null);
    clearResults();
    clearExplanations();
    setHistoryFetchFailed(false);
  };

  const handleSelectTrack = async (id: string) => {
    clearResults();
    setSelectedTrackId(id);
    setActiveTrack(null);
    setHistoryFetchFailed(false);

    const track = getTrack(id);
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
          source: 'Stored file',
        };
        setActiveTrack({ type: 'reference', file, metadata });
        // Shift focus to the player so keyboard users land on the loaded track
        requestAnimationFrame(() => playerRef.current?.focus());
        if (track.featureVector) {
          findSimilarFromVector(track.featureVector);
        } else {
          findSimilar(file);
        }
      } else {
        setHistoryFetchFailed(true);
      }
    } catch (err) {
      console.error('Failed to load history track:', err);
      setHistoryFetchFailed(true);
    }
  };

  const handleSelectMatch = (result: SimilarityResult) => {
    // Build the R2 streaming URL from the library's relative file path.
    // Paths in feature_vectors.json use "./data/fma_small/..." or "data/musopen/..."
    // — strip the leading prefixes, then encode each path segment individually
    // so spaces in Musopen filenames don't break the URL.
    const baseUrl = process.env.REACT_APP_R2_PUBLIC_URL!;
    const r2Key = result.file.replace(/^\.\//, '').replace(/^data\//, '');
    const encodedKey = r2Key.split('/').map(segment => encodeURIComponent(segment)).join('/');
    const r2Url = `${baseUrl}/${encodedKey}`;

    setActiveTrack({
      type: 'match',
      file: r2Url,
      features: result.features ?? undefined,
      metadata: parseTrackDisplay(result.file),
    });

    setSelectedMatchFile(result.file);
    requestAnimationFrame(() => playerRef.current?.focus());
  };

  const handleClearActiveTrack = () => {
    setActiveTrack(null);
  };

  const handleRemoveTrack = async (id: string) => {
    await removeTrack(id);
    if (selectedTrackId === id) {
      setSelectedTrackId(null);
      setActiveTrack(null);
      setHistoryFetchFailed(false);
    }
  };

  const handleClearAllTracks = async () => {
    await clearAllTracks();
    setSelectedTrackId(null);
    setActiveTrack(null);
    setHistoryFetchFailed(false);
    clearResults();
    clearExplanations();
    clearFile();
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
            playerRef={playerRef}
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
            referenceExplanation={referenceExplanation}
            matchExplanation={matchExplanation}
            isExplainingTrack={isExplainingTrack}
            explanationError={explanationError}
            onExplainReference={explainReference}
            onExplainMatch={explainMatchTrack}
            onRestoreReference={restoreReferenceExplanation}
            onSelectEntryPoint={handleEntryPointSelect}
            loadingEntryPoint={loadingEntryPoint}
          />

          <Sidebar
            trackHistory={trackHistory}
            selectedTrackId={selectedTrackId}
            onSelectTrack={handleSelectTrack}
            onRemoveTrack={handleRemoveTrack}
            onClearAll={handleClearAllTracks}
            storageStats={storageStats}
            storageFull={storageFull}
            similarityResults={similarityResults}
            isSearching={isSearching}
            onSelectMatch={handleSelectMatch}
            activeMatchId={selectedMatchFile}
            progressState={progressState}
          />
        </div>
      </div>
    </div>
  );
}

export default App;