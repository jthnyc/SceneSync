import React, { useState, useEffect } from 'react';
import { formatFileSize, formatDuration } from '../utils/formatUtils';
import {
  EntryPoints,
  UploadZone,
  FeatureVisualizations,
  AudioPlayer,
  SimilarityResults,
  TrackExplanation
} from './';
import type { AnalyzedTrack } from '../types/audio';
import type { SimilarityResult } from '../services/similarityService';
import type { TrackDisplay } from '../utils/parseTrackDisplay';
import type { FeatureVector } from '../workers/featureExtraction.types';
import type { EntryPoint } from '../config/entryPoints';

interface MainContentProps {
  playerRef?: React.RefObject<HTMLDivElement | null >;
  selectedFile: File | null;
  selectedTrackId: string | null;
  trackHistory: AnalyzedTrack[];
  similarityResults: SimilarityResult[] | null;
  isSearching: boolean;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onFileDrop: (e: React.DragEvent) => void;
  onClearFile: () => void;
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
  historyFetchFailed?: boolean;
  referenceExplanation: string | null;
  matchExplanation: string | null;
  isExplainingTrack: boolean;
  explanationError: string | null;
  onExplainReference: (fv: FeatureVector) => Promise<void>;
  onExplainMatch: (refFv: FeatureVector, matchFv: FeatureVector) => Promise<void>;
  onRestoreReference: () => void;
  onSelectEntryPoint: (entryPoint: EntryPoint) => void;
  loadingEntryPoint: string | null;
}

const MainContent: React.FC<MainContentProps> = ({
  playerRef,
  selectedFile,
  selectedTrackId,
  trackHistory,
  similarityResults,
  isSearching,
  onFileChange,
  onFileDrop,
  onClearFile,
  activeTrack,
  referenceFeatures,
  onSelectMatch,
  onClearActiveTrack,
  onShowReference,
  selectedMatchFile,
  featureVector,
  historyFetchFailed,
  referenceExplanation,
  matchExplanation,
  isExplainingTrack,
  explanationError,
  onExplainReference,
  onExplainMatch,
  onRestoreReference,
  onSelectEntryPoint,
  loadingEntryPoint,
}) => {
  const [referenceTrack, setReferenceTrack] = useState<{
    file: File;
    features?: FeatureVector;
    metadata: TrackDisplay;
  } | null>(null);

  const currentTrack = selectedTrackId
    ? trackHistory.find(t => t.id === selectedTrackId)
    : null;

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

  const liveMessage = activeTrack?.type === 'match'
    ? `Now playing match: ${activeTrack.metadata.title}`
    : activeTrack?.type === 'reference'
    ? `Analyzing: ${activeTrack.metadata.title}`
    : '';

  return (
    <div className="lg:col-span-2 lg:order-2 bg-gray-800/50 p-4 sm:p-6 rounded-xl border border-gray-700">
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {liveMessage}
      </div>
      <h2 className="text-xl font-semibold mb-4 text-primary-400">Upload Audio</h2>

      {!selectedFile && (
        <EntryPoints
          onSelect={onSelectEntryPoint}
          loadingZone={loadingEntryPoint}
        />
      )}
      
      <UploadZone
        onFileChange={onFileChange}
        onFileDrop={onFileDrop}
        // reduce min height slightly to accommodate entry point cards above
        // pass a prop or override via className — see note below
      />
      
      {/* // NOTE on UploadZone height:
      // UploadZone hardcodes min-h-[180px] sm:min-h-[200px] internally.
      // Easiest approach: add an optional className prop to UploadZone and
      // pass "min-h-[140px] sm:min-h-[160px]" when entry points are visible.
      // Alternatively just leave the height unchanged — the cards are compact
      // enough that the combined height is acceptable without adjustment.
      // Recommend leaving height unchanged for now and revisiting if it feels
      // cramped on a real screen. */}

      {/* Main Audio Player */}
      {activeTrack && (
        <div className="mt-4" ref={playerRef} tabIndex={-1}>
          <AudioPlayer
            audioFile={activeTrack.file}
            metadata={activeTrack.metadata}
            activeType={activeTrack.type}
            onClear={handleClear}
            hasReference={activeTrack.type === 'match' && referenceTrack !== null}
            onShowReference={handleShowReference}
            isPreview={activeTrack.type === 'match'}
          />
        </div>
      )}

      {/* Explanation layer — auto-fires on match selection */}
      {featureVector && (
        <TrackExplanation
          featureVector={featureVector}
          matchFeatureVector={activeTrack?.type === 'match' ? activeTrack.features ?? null : null}
          referenceTitle={selectedFile?.name ?? null}
          matchTitle={activeTrack?.type === 'match' ? activeTrack.metadata.title ?? null : null}
          referenceExplanation={referenceExplanation}
          matchExplanation={matchExplanation}
          isExplaining={isExplainingTrack}
          error={explanationError}
          onExplainReference={onExplainReference}
          onExplainMatch={onExplainMatch}
          onRestoreReference={onRestoreReference}
        />
      )}

      {/* Matches — mobile only. Desktop sees these in Sidebar. */}
      {(isSearching || (similarityResults && similarityResults.length > 0)) && (
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

      {/* History track — audio not in storage */}
      {selectedTrackId && !selectedFile && historyFetchFailed && currentTrack && (
        <div className="mt-4 space-y-3">
          <div className="bg-gray-700/30 p-4 rounded-lg">
            <div className="text-sm text-gray-400 mb-1">Viewing from history</div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="text-white font-medium truncate">{currentTrack.fileName}</div>
              {currentTrack.duration && (
                <div className="flex items-center gap-3 text-sm flex-shrink-0">
                  <span className="text-gray-400">{formatFileSize(currentTrack.fileSize)}</span>
                  <span className="text-gray-600">•</span>
                  <span className="text-white font-medium">
                    {formatDuration(currentTrack.duration)}
                  </span>
                </div>
              )}
            </div>
          </div>
          <div className="bg-amber-900/20 p-4 rounded-lg border border-amber-700/50">
            <div className="text-sm text-amber-200">
              ⚠️ Audio not in storage — drop it above to re-analyze.
            </div>
          </div>
        </div>
      )}

      {/* Visualizations */}
      {featureVector && (
        <div className="mt-6">
          <FeatureVisualizations
            features={activeTrack?.type === 'match' ? activeTrack.features ?? undefined : featureVector ?? undefined}
            referenceFeatures={referenceFeatures}
            showComparison={activeTrack?.type === 'match'}
          />
        </div>
      )}
    </div>
  );
};

export default MainContent;
