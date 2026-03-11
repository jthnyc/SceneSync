import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { PredictionResult } from '../hooks/useScenePrediction';
import { formatFileSize, formatDuration } from '../utils/formatUtils';
import { audioStorage } from '../services/audioStorageService';
import {
  UploadZone,
  FeatureVisualizations,
  SkeletonCard,
  ErrorDisplay,
  AudioPlayer,
  SimilarityResults,
  TrackExplanation
} from './';
import type { ErrorState } from '../hooks/useScenePrediction';
import type { AnalyzedTrack } from '../types/audio';
import type { SimilarityResult } from '../services/similarityService';
import type { TrackDisplay } from '../utils/parseTrackDisplay';
import type { FeatureVector } from '../workers/featureExtraction.types';

interface MainContentProps {
  selectedFile: File | null;
  selectedTrackId: string | null;
  trackHistory: AnalyzedTrack[];
  displayResult: PredictionResult | undefined;
  isPredicting: boolean;
  isLoading: boolean;
  hasError: boolean;
  error: ErrorState | null;
  similarityResults: SimilarityResult[] | null;
  isSearching: boolean;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onFileDrop: (e: React.DragEvent) => void;
  onClearFile: () => void;
  onRetry?: () => void;
  onDismissError?: () => void;
  activeTrack: {
    type: 'reference' | 'match';
    file: File | string;
    features?: FeatureVector;
    metadata: TrackDisplay;
  } | null;
  referenceFeatures: FeatureVector | null;
  onSelectMatch: (result: SimilarityResult) => void;
  onClearActiveTrack: () => void;
  onShowReference?: (track: { file: File; features?: FeatureVector; metadata: TrackDisplay }) => void;
  selectedMatchFile?: string;
  featureVector: FeatureVector | null;
}

const MainContent: React.FC<MainContentProps> = ({
  selectedFile,
  selectedTrackId,
  trackHistory,
  displayResult,
  isPredicting,
  isLoading,
  hasError,
  error,
  similarityResults,
  isSearching,
  onFileChange,
  onFileDrop,
  onClearFile,
  onRetry,
  onDismissError,
  activeTrack,
  referenceFeatures,
  onSelectMatch,
  onClearActiveTrack,
  onShowReference,
  selectedMatchFile,
  featureVector,
}) => {
  const [historyAudioFile, setHistoryAudioFile] = useState<File | null>(null);
  const [loadingHistoryAudio, setLoadingHistoryAudio] = useState(false);
  const [referenceTrack, setReferenceTrack] = useState<{
    file: File;
    features?: FeatureVector;
    metadata: TrackDisplay;
  } | null>(null);

  const currentTrack = selectedTrackId
    ? trackHistory.find(t => t.id === selectedTrackId)
    : null;

  useEffect(() => {
    if (selectedTrackId && !selectedFile && currentTrack?.hasStoredAudio) {
      setLoadingHistoryAudio(true);
      setHistoryAudioFile(null);
      audioStorage.getAudioFile(selectedTrackId)
        .then((file) => {
          if (file) setHistoryAudioFile(file);
        })
        .catch((err) => {
          console.error('Failed to load audio from storage:', err);
          setHistoryAudioFile(null);
          toast.error('Could not load audio from storage. Try re-uploading the file.', {
            duration: 4000,
          });
        })
        .finally(() => {
          setLoadingHistoryAudio(false);
        });
    } else {
      setHistoryAudioFile(null);
    }
  }, [selectedTrackId, selectedFile, currentTrack]);

  useEffect(() => {
    if (activeTrack?.type === 'reference' && activeTrack.file instanceof File) {
      setReferenceTrack({
        file: activeTrack.file,
        features: activeTrack.features,
        metadata: activeTrack.metadata
      });
    }
  }, [activeTrack]);

  useEffect(() => {
    const handleShowReferenceEvent = ((event: CustomEvent) => {
      const track = event.detail;
      if (onShowReference) {
        onShowReference(track);
      }
    }) as EventListener;

    window.addEventListener('showReference', handleShowReferenceEvent);
    return () => window.removeEventListener('showReference', handleShowReferenceEvent);
  }, [onShowReference]);

  const handleClear = () => {
    onClearFile();
    onClearActiveTrack();
  };

  const handleShowReference = () => {
    if (referenceTrack) {
      const event = new CustomEvent('showReference', { detail: referenceTrack });
      window.dispatchEvent(event);
    }
  };

  return (
    <div className="lg:col-span-2 lg:order-2 bg-gray-800/50 p-4 sm:p-6 rounded-xl border border-gray-700">
      <h2 className="text-xl font-semibold mb-4 text-primary-400">Upload Audio</h2>

      <UploadZone
        onFileChange={onFileChange}
        onFileDrop={onFileDrop}
        isPredicting={isPredicting}
        isLoading={isLoading}
        hasError={hasError}
      />

      {error && (
        <div className="mt-4">
          <ErrorDisplay
            message={error.message}
            type={error.type}
            severity="error"
            canRetry={error.canRetry}
            onRetry={onRetry}
            onDismiss={onDismissError}
          />
        </div>
      )}

      {/* Main Audio Player */}
      {activeTrack && !error && !isPredicting && (
        <div className="mt-4">
          <AudioPlayer
            audioFile={activeTrack.file}
            metadata={activeTrack.metadata}
            activeType={activeTrack.type}
            onClear={handleClear}
            hasReference={activeTrack.type === 'match' && referenceTrack !== null}
            onShowReference={handleShowReference}
          />
        </div>
      )}

      {/* Legacy player for history audio */}
      {!activeTrack && !selectedFile && historyAudioFile && currentTrack && !error && !isPredicting && (
        <div className="mt-4">
          <AudioPlayer
            audioFile={historyAudioFile}
            fileName={currentTrack.fileName}
            fileSize={currentTrack.fileSize}
            onClear={handleClear}
          />
        </div>
      )}

      {/* Explanation layer — auto-fires on match selection */}
      {featureVector && !error && (
        <TrackExplanation
          featureVector={featureVector}
          matchFeatureVector={activeTrack?.type === 'match' ? activeTrack.features ?? null : null}
          referenceTitle={selectedFile?.name ?? null}
          matchTitle={activeTrack?.type === 'match' ? activeTrack.metadata.title ?? null : null}
        />
      )}

      {/* Matches — mobile only. Desktop sees these in Sidebar. */}
      {(isSearching || (similarityResults && similarityResults.length > 0)) && !error && (
        <div className="lg:hidden">
          <SimilarityResults
            results={similarityResults ?? []}
            isSearching={isSearching}
            onSelectMatch={onSelectMatch}
            activeMatchId={selectedMatchFile}
            compact={true}
          />
        </div>
      )}

      {/* Loading state for history audio */}
      {loadingHistoryAudio && !selectedFile && (
        <div className="mt-4 bg-gray-700/30 p-4 rounded-lg">
          <div className="text-sm text-gray-400 mb-2">Loading audio from storage...</div>
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div className="bg-blue-500 h-2 rounded-full animate-pulse" style={{ width: '60%' }} />
          </div>
        </div>
      )}

      {/* Basic file info while predicting */}
      {selectedFile && !error && isPredicting && (
        <div className="mt-4 bg-gray-700/30 p-4 rounded-lg">
          <div className="text-sm text-gray-400 mb-1">Analyzing</div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="text-white font-medium truncate">{selectedFile.name}</div>
            {displayResult?.audioDuration && (
              <div className="flex items-center gap-3 text-sm flex-shrink-0">
                <span className="text-gray-400">{formatFileSize(selectedFile.size)}</span>
                <span className="text-gray-600">•</span>
                <span className="text-white font-medium">
                  {formatDuration(displayResult.audioDuration)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* History track — audio not in storage */}
      {selectedTrackId && !selectedFile && !historyAudioFile && !loadingHistoryAudio && currentTrack && !error && (
        <div className="mt-4 space-y-3">
          <div className="bg-gray-700/30 p-4 rounded-lg">
            <div className="text-sm text-gray-400 mb-1">Viewing from history</div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="text-white font-medium truncate">{currentTrack.fileName}</div>
              {displayResult?.audioDuration && (
                <div className="flex items-center gap-3 text-sm flex-shrink-0">
                  <span className="text-gray-400">{formatFileSize(currentTrack.fileSize)}</span>
                  <span className="text-gray-600">•</span>
                  <span className="text-white font-medium">
                    {formatDuration(displayResult.audioDuration)}
                  </span>
                </div>
              )}
            </div>
          </div>
          <div className="bg-amber-900/20 p-4 rounded-lg border border-amber-700/50">
            <div className="text-sm text-amber-200">
              ⚠️ Audio file not available in storage. Re-upload to play this track.
            </div>
          </div>
        </div>
      )}

      {/* Visualizations skeleton */}
      {isPredicting && !displayResult && (
        <div className="mt-6 space-y-6">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {/* Visualizations */}
      {featureVector && !isPredicting && !error && (
        <div className="mt-6">
          <FeatureVisualizations
            features={featureVector}
            referenceFeatures={referenceFeatures}
            showComparison={activeTrack?.type === 'match'}
          />
        </div>
      )}
    </div>
  );
};

export default MainContent;