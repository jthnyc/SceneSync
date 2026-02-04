import React, { useEffect, useRef } from 'react';
import { PredictionResult } from '../hooks/useScenePrediction';
import PredictionResults from './PredictionResults';
import TrackHistory from './TrackHistory';
import EmptyState from './EmptyState';
import ProgressIndicator from './ProgressIndicator';
import { Skeleton, SkeletonText } from './Skeleton';

interface Track {
  id: string;
  fileName: string;
  fileSize: number;
  timestamp: number;
  result: PredictionResult;
}

interface SidebarProps {
  displayResult: PredictionResult | undefined;
  isPredicting: boolean;
  trackHistory: Track[];
  selectedTrackId: string | null;
  sceneDescriptions: { [key: string]: string };
  showResults: boolean;
  progress: number;
  progressStage: string;
  onSelectTrack: (id: string) => void;
  onRemoveTrack: (id: string) => void;
  onClearAll: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  displayResult,
  isPredicting,
  trackHistory,
  selectedTrackId,
  sceneDescriptions,
  showResults,
  progress,
  progressStage,
  onSelectTrack,
  onRemoveTrack,
  onClearAll,
}) => {
  const announcementRef = useRef<HTMLDivElement>(null);

  // Announce when prediction completes
  useEffect(() => {
    if (displayResult && !isPredicting && announcementRef.current) {
      const announcement = `Analysis complete. Scene type: ${displayResult.sceneType}. Confidence: ${(displayResult.confidence * 100).toFixed(0)} percent.`;
      announcementRef.current.textContent = announcement;
    }
  }, [displayResult, isPredicting]);

  return (
    <div className="lg:col-span-1 bg-gray-800/50 p-4 sm:p-6 rounded-xl border border-gray-700">
      {/* Screen reader announcements */}
      <div
        ref={announcementRef}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      />

      <h2 className="text-xl font-semibold mb-4 text-primary-400">
        Prediction Results
      </h2>
      
      {/* Empty State */}
      {!displayResult && !isPredicting && trackHistory.length === 0 && (
        <EmptyState />
      )}

      {/* Progress Indicator */}
      {isPredicting && (
        <div className="space-y-4 mb-6">
          <div role="status" aria-live="polite" aria-label={progressStage}>
            <ProgressIndicator progress={progress} stage={progressStage} />
          </div>
          
          {/* Optional: Keep skeleton for visual continuity */}
          <div className="pt-4 opacity-30 hidden sm:block" aria-hidden="true">
            <div className="bg-gray-700/50 p-4 rounded-lg">
              <Skeleton className="h-4 w-20 mb-2" />
              <Skeleton className="h-8 w-32 mb-3" />
              <SkeletonText lines={2} />
            </div>
          </div>
        </div>
      )}

      {/* Prediction Results */}
      {displayResult && !isPredicting && (
        <div role="region" aria-label="Analysis results">
          <PredictionResults
            result={displayResult}
            sceneDescriptions={sceneDescriptions}
            showResults={showResults}
          />
        </div>
      )}

      {/* Track History */}
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