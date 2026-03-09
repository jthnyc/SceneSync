// ── TrackExplanation ──────────────────────────────────────────────────────
// Two modes:
//
//   Reference mode (matchFeatureVector absent or null):
//     "What am I hearing?" button — fires on demand.
//     Result is cached in a ref at the moment it resolves — not via useEffect —
//     so match text can never pollute the reference cache.
//
//   Match mode (matchFeatureVector present):
//     Auto-fires when a match card is selected (no button press needed).
//     On return to reference, cached reference explanation is restored.
//
// trackTitle / matchTitle displayed above the explanation so users always
// know which track the analysis refers to.

import React, { useEffect, useRef, useState } from 'react';
import { Ear, Loader2, AlertCircle } from 'lucide-react';
import { FeatureVector } from '../workers/featureExtraction.types';
import { useTrackExplanation } from '../hooks/useTrackExplanation';

interface TrackExplanationProps {
  featureVector: FeatureVector | null;
  matchFeatureVector?: FeatureVector | null;
  referenceTitle?: string | null;
  matchTitle?: string | null;
}

const TrackExplanation: React.FC<TrackExplanationProps> = ({
  featureVector,
  matchFeatureVector,
  referenceTitle,
  matchTitle,
}) => {
  const { isExplaining, error, explain, explainMatch, reset } = useTrackExplanation();

  const isMatchMode = !!matchFeatureVector;

  // Reference explanation is cached here at the moment the button resolves —
  // never written from a useEffect, so match text cannot overwrite it
  const referenceCache = useRef<string | null>(null);

  // What's currently displayed — managed locally, not from hook state
  const [displayExplanation, setDisplayExplanation] = useState<string | null>(null);
  const [displayMode, setDisplayMode] = useState<'reference' | 'match' | null>(null);

  // Reference mode: button click — cache result at resolution time
  const handleClick = async () => {
    const result = await explain(featureVector);
    if (result) {
      referenceCache.current = result;
      setDisplayExplanation(result);
      setDisplayMode('reference');
    }
  };

  // Match mode: auto-fire when matchFeatureVector changes
  useEffect(() => {
    if (matchFeatureVector && featureVector) {
      setDisplayExplanation(null);
      reset();
      explainMatch(featureVector, matchFeatureVector).then((result) => {
        if (result) {
          setDisplayExplanation(result);
          setDisplayMode('match');
        }
      });
    }
  }, [matchFeatureVector]); // eslint-disable-line react-hooks/exhaustive-deps

  // Returning to reference: restore cached explanation — never match text
  useEffect(() => {
    if (!matchFeatureVector) {
      if (referenceCache.current) {
        setDisplayExplanation(referenceCache.current);
        setDisplayMode('reference');
      } else {
        setDisplayExplanation(null);
        setDisplayMode(null);
      }
    }
  }, [matchFeatureVector]);

  // New reference track dropped: clear everything including cache
  useEffect(() => {
    referenceCache.current = null;
    setDisplayExplanation(null);
    setDisplayMode(null);
    reset();
  }, [featureVector]); // eslint-disable-line react-hooks/exhaustive-deps

  const isReady = !!featureVector && !isExplaining;
  const activeTitle = displayMode === 'match' ? matchTitle : referenceTitle;

  return (
    <div className="mt-4">

      {/* Button — reference mode only */}
      {!isMatchMode && (
        <button
          onClick={handleClick}
          disabled={!isReady}
          className={`
            flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
            transition-all duration-150
            ${isReady
              ? 'bg-gray-700 hover:bg-gray-600 text-gray-200 cursor-pointer'
              : 'bg-gray-800 text-gray-600 cursor-not-allowed'
            }
          `}
        >
          {isExplaining
            ? <Loader2 size={14} className="animate-spin text-primary-400" />
            : <Ear size={14} className={isReady ? 'text-primary-400' : 'text-gray-600'} />
          }
          {isExplaining ? 'Listening...' : 'What am I hearing?'}
        </button>
      )}

      {/* Match mode loading state */}
      {isMatchMode && isExplaining && (
        <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
          <Loader2 size={12} className="animate-spin text-primary-400" />
          Analyzing why this matches...
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