import React from 'react';
import type { AnalyzedTrack } from '../types/audio';
import { StorageInfo } from './PrivacyNotice';
import ExtractionProgress from './ExtractionProgress';
import type { SimilarityResult } from '../services/similarityService';
import { TrackHistory, EmptyState, SimilarityResults } from './';

interface SidebarProps {
  trackHistory: AnalyzedTrack[];
  selectedTrackId: string | null;
  onSelectTrack: (id: string) => void;
  onRemoveTrack: (id: string) => void;
  onClearAll: () => void;
  storageStats: { count: number; size: number };
  storageFull: boolean;
  similarityResults: SimilarityResult[] | null;
  isSearching: boolean;
  onSelectMatch: (result: SimilarityResult) => void;
  activeMatchId?: string;
  progressState: { progress: number; stage: string };
}

const Sidebar: React.FC<SidebarProps> = ({
  trackHistory,
  selectedTrackId,
  onSelectTrack,
  onRemoveTrack,
  onClearAll,
  storageStats,
  storageFull,
  similarityResults,
  isSearching,
  onSelectMatch,
  activeMatchId,
  progressState,
}) => {
  return (
    <div className="lg:col-span-1 lg:order-1 bg-gray-800/50 p-4 sm:p-6 rounded-xl border border-gray-700">
      <h2 className="sr-only">Results and History</h2>
      {trackHistory.length === 0 && progressState.progress === 0 && <EmptyState />}

      {progressState.progress > 0 && (
        <ExtractionProgress progress={progressState.progress} stage={progressState.stage} />
      )}

      <div className="hidden lg:block">
        <SimilarityResults
          results={similarityResults ?? []}
          isSearching={isSearching}
          onSelectMatch={onSelectMatch}
          activeMatchId={activeMatchId}
        />
      </div>

      <div className="mt-6">
        <StorageInfo
          fileCount={storageStats.count}
          totalSize={storageStats.size}
          isFull={storageFull}
        />
      </div>

      <TrackHistory
        tracks={trackHistory}
        selectedTrackId={selectedTrackId}
        onSelectTrack={onSelectTrack}
        onRemoveTrack={onRemoveTrack}
        onClearAll={onClearAll}
      />
    </div>
  );
};

export default Sidebar;