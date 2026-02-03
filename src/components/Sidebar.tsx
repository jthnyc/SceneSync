import React from 'react';
import { PredictionResult } from '../hooks/useScenePrediction';
import PredictionResults from './PredictionResults';
import TrackHistory from './TrackHistory';
import { Skeleton, SkeletonText } from './Skeleton';

interface Track {
  id: string;
  fileName: string;
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
  onSelectTrack,
  onRemoveTrack,
  onClearAll,
}) => {
  return (
    <div className="lg:col-span-1 bg-gray-800/50 p-6 rounded-xl border border-gray-700">
      <h2 className="text-xl font-semibold mb-4 text-primary-400">Prediction Results</h2>
      
      {/* Empty State */}
      {!displayResult && !isPredicting && trackHistory.length === 0 && (
        <p className="text-gray-500 text-sm">Upload an audio file to see results</p>
      )}

      {/* Loading Skeleton */}
      {isPredicting && (
        <div className="space-y-4 mb-6">
          {/* Skeleton for Scene Type card */}
          <div className="bg-gray-700/50 p-4 rounded-lg">
            <Skeleton className="h-4 w-20 mb-2" />
            <Skeleton className="h-8 w-32 mb-3" />
            <SkeletonText lines={2} />
            <Skeleton className="h-4 w-24 mt-3" />
          </div>

          {/* Skeleton for All Probabilities */}
          <div>
            <Skeleton className="h-4 w-32 mb-3" />
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="mb-3">
                <div className="flex justify-between mb-1">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-12" />
                </div>
                <Skeleton className="h-2 w-full" />
              </div>
            ))}
          </div>

          <Skeleton className="h-4 w-40" />
        </div>
      )}

      {/* Prediction Results */}
      {displayResult && (
        <PredictionResults
          result={displayResult}
          sceneDescriptions={sceneDescriptions}
          showResults={showResults}
        />
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
