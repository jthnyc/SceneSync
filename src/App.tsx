import React, { useEffect, useState } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { useSimilaritySearch } from './hooks/useSimilaritySearch';
import { useTrackHistory } from './hooks/useTrackHistory';
import { useExplanationCache } from './hooks/useExplanationCache';
import type { TrackDisplay } from './utils/parseTrackDisplay';
import type { FeatureVector } from './workers/featureExtraction.types';
import type { SimilarityResult } from './services/similarityService';
import { audioStorage } from './services/audioStorageService';
import { PrivacyNotice } from './components/PrivacyNotice';
import { validateAudioFile } from './utils/fileValidation';
import { Header, Sidebar, MainContent } from './components';
import { parseTrackDisplay } from './utils/parseTrackDisplay';

import './index.css';

function App() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [activeTrack, setActiveTrack] = useState<{
    type: 'reference' | 'match';
    file: File | string;
    features?: FeatureVector;
    metadata: TrackDisplay;
  } | null>(null);
  const [selectedMatchFile, setSelectedMatchFile] = useState<string | undefined>(undefined);
  const [historyFetchFailed, setHistoryFetchFailed] = useState(false); 

  const {
    isSearching,
    results: similarityResults,
    featureVector: referenceFeatureVector,
    duration: referenceDuration,
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
    updateTrack, // passed into useExplanationCache
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

  const handleShowReference = (track: { file: File; features?: FeatureVector; metadata: TrackDisplay }) => {
    setActiveTrack({
      type: 'reference',
      file: track.file,
      features: track.features,
      metadata: track.metadata
    });
  };

  // Add track to history when feature extraction completes
  useEffect(() => {
    if (!referenceFeatureVector || !selectedFile) return;
    addTrack(selectedFile, referenceFeatureVector, referenceDuration)
      .then((trackId) => {
        if (trackId) {
          setSelectedTrackId(trackId);
          explainReference(referenceFeatureVector, trackId);
        }
      });
       // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [referenceFeatureVector, selectedFile, referenceDuration, addTrack]);

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
    clearExplanations();
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
          source: 'Stored file'
        };
        setActiveTrack({ type: 'reference', file, metadata });
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

  const handleRemoveTrack = async (id: string) => {
    await removeTrack(id);
    if (selectedTrackId === id) {
      setSelectedTrackId(null);
      setSelectedFile(null);
      setActiveTrack(null);
      setHistoryFetchFailed(false);
    }
  };

  const handleClearAllTracks = async () => {
    await clearAllTracks();
    setSelectedTrackId(null);
    setSelectedFile(null);
    setActiveTrack(null);
    setHistoryFetchFailed(false);
    clearResults();
    clearExplanations();
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
            referenceExplanation={referenceExplanation}
            matchExplanation={matchExplanation}
            isExplainingTrack={isExplainingTrack}
            explanationError={explanationError}
            onExplainReference={explainReference}
            onExplainMatch={explainMatchTrack}
            onRestoreReference={restoreReferenceExplanation}
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
          />
        </div>
      </div>
    </div>
  );
}

export default App;
