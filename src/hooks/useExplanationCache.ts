// ── useExplanationCache ───────────────────────────────────────────────────
// Owns explanation fetching, caching, and IndexedDB persistence.
// Sits between useTrackExplanation (LLM API calls) and TrackExplanation
// (display component).
//
// Reference explanations persist across sessions via IndexedDB.
// Match explanations persist per reference track — keyed by match file path.
// Both are synced to in-memory trackHistory via updateTrack.

import { useState, useCallback } from 'react';
import { useTrackExplanation } from './useTrackExplanation';
import type { FeatureVector } from '../workers/featureExtraction.types';
import type { AnalyzedTrack } from '../types/audio';

interface UseExplanationCacheParams {
  selectedTrackId: string | null;
  activeMatchFile: string | null;
  getTrack: (id: string) => AnalyzedTrack | undefined;
  updateTrack: (id: string, partial: Partial<AnalyzedTrack>) => Promise<void>;
  storageAvailable: boolean;
}

export const useExplanationCache = ({
  selectedTrackId,
  activeMatchFile,
  getTrack,
  updateTrack,
  storageAvailable,
}: UseExplanationCacheParams) => {
  const { explain, explainMatch, isExplaining, error } = useTrackExplanation();

  const [referenceExplanation, setReferenceExplanation] = useState<string | null>(null);
  const [matchExplanation, setMatchExplanation] = useState<string | null>(null);

  const explainReference = useCallback(async (
    featureVector: FeatureVector,
    trackId?: string  // optional override — used when selectedTrackId not yet set
    ): Promise<void> => {
    const id = trackId ?? selectedTrackId;
    if (!id) return;

    const track = getTrack(id);
    if (track?.referenceExplanation) {
        setReferenceExplanation(track.referenceExplanation);
        return;
    }

    const result = await explain(featureVector);
    if (!result) return;

    setReferenceExplanation(result);
    if (storageAvailable) {
        updateTrack(id, { referenceExplanation: result });
    }
    }, [selectedTrackId, getTrack, explain, updateTrack, storageAvailable]);

  const explainMatchTrack = useCallback(async (
    referenceVector: FeatureVector,
    matchVector: FeatureVector,
  ): Promise<void> => {
    if (!selectedTrackId || !activeMatchFile) return;

    // Check in-memory cache first
    const track = getTrack(selectedTrackId);
    const cached = track?.matchExplanations?.[activeMatchFile];
    if (cached) {
      setMatchExplanation(cached);
      return;
    }

    const result = await explainMatch(referenceVector, matchVector);
    if (!result) return;

    setMatchExplanation(result);

    if (storageAvailable) {
      const existingMatchExplanations = track?.matchExplanations ?? {};
      updateTrack(selectedTrackId, {
        matchExplanations: {
          ...existingMatchExplanations,
          [activeMatchFile]: result,
        }
      });
    }
  }, [selectedTrackId, activeMatchFile, getTrack, explainMatch, updateTrack, storageAvailable]);

  const clearExplanations = useCallback(() => {
    setReferenceExplanation(null);
    setMatchExplanation(null);
  }, []);

  const restoreReferenceExplanation = useCallback(() => {
    if (!selectedTrackId) return;
    const track = getTrack(selectedTrackId);
    if (track?.referenceExplanation) {
      setReferenceExplanation(track.referenceExplanation);
      setMatchExplanation(null);
    }
  }, [selectedTrackId, getTrack]);

  return {
    referenceExplanation,
    matchExplanation,
    isExplaining,
    error,
    explainReference,
    explainMatchTrack,
    clearExplanations,
    restoreReferenceExplanation,
  };
};