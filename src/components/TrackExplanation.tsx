// ── TrackExplanation ──────────────────────────────────────────────────────
// Pure display component. All caching and API calls handled by
// useExplanationCache in App.tsx.
//
// Two modes:
//   Reference mode: auto-fires onExplainReference when featureVector changes
//   Match mode: auto-fires onExplainMatch when matchFeatureVector changes
//               calls onRestoreReference when match is cleared

import React, { useEffect } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { FeatureVector } from '../workers/featureExtraction.types';

interface TrackExplanationProps {
  featureVector: FeatureVector | null;
  matchFeatureVector?: FeatureVector | null;
  referenceTitle?: string | null;
  matchTitle?: string | null;
  referenceExplanation: string | null;
  matchExplanation: string | null;
  isExplaining: boolean;
  error: string | null;
  onExplainReference: (fv: FeatureVector) => Promise<void>;
  onExplainMatch: (refFv: FeatureVector, matchFv: FeatureVector) => Promise<void>;
  onRestoreReference: () => void;
}

const TrackExplanation: React.FC<TrackExplanationProps> = ({
  featureVector,
  matchFeatureVector,
  referenceTitle,
  matchTitle,
  referenceExplanation,
  matchExplanation,
  isExplaining,
  error,
  onExplainMatch,
  onRestoreReference,
}) => {
  const isMatchMode = !!matchFeatureVector;

  // Auto-fire match explanation or restore reference when matchFeatureVector changes
  useEffect(() => {
    if (matchFeatureVector && featureVector) {
      onExplainMatch(featureVector, matchFeatureVector);
    } else if (!matchFeatureVector) {
      onRestoreReference();
    }
  }, [matchFeatureVector]); // eslint-disable-line react-hooks/exhaustive-deps

  const displayExplanation = isMatchMode ? matchExplanation : referenceExplanation;
  const activeTitle = isMatchMode ? matchTitle : referenceTitle;
  const displayMode = isMatchMode ? 'match' : 'reference';

  return (
    <div className="mt-4">
      {/* Loading state */}
      {isExplaining && (
        <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
          <Loader2 size={12} className="animate-spin text-primary-400" />
          {isMatchMode ? 'Analyzing why this matches...' : 'Listening...'}
        </div>
      )}

      {/* Explanation readout */}
      {displayExplanation && !isExplaining && (
        <div className="mt-3 p-4 bg-gray-800/60 border border-gray-700/40 rounded-lg">
          {activeTitle && (
            <div className="text-xs font-medium text-primary-400 mb-2 truncate">
              {displayMode === 'match' ? `Why this matches · ${activeTitle}` : activeTitle}
            </div>
          )}
          <p className="text-sm text-gray-200 leading-relaxed">
            {displayExplanation}
          </p>
          <p className="text-xs text-gray-600 mt-2">
            {displayMode === 'match' ? 'Match analysis · AI-assisted' : 'Acoustic analysis · AI-assisted'}
          </p>
        </div>
      )}

      {/* Error state */}
      {error && !isExplaining && (
        <div className="mt-3 p-3 bg-red-900/20 border border-red-700/30 rounded-lg flex items-start gap-2">
          <AlertCircle size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}
    </div>
  );
};

export default TrackExplanation;