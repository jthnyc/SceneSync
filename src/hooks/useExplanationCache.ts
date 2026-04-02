// ── useExplanationCache ───────────────────────────────────────────────────
// Owns explanation fetching, caching, and IndexedDB persistence.
// Sits between useTrackExplanation (LLM API calls) and TrackExplanation
// (display component).
//
// Reference explanations persist across sessions via IndexedDB.
// Match explanations persist per reference track — keyed by match file path.
// Both are synced to in-memory trackHistory via updateTrack.

import { useState, useCallback, useRef, useEffect } from 'react';
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

  // Ref kept in sync with selectedTrackId so post-await staleness checks
  // read the current value rather than the closure value at call time.
  const selectedTrackIdRef = useRef<string | null>(selectedTrackId);
  useEffect(() => {
    selectedTrackIdRef.current = selectedTrackId;
  }, [selectedTrackId]);

  const explainReference = useCallback(async (
    featureVector: FeatureVector,
    // trackId override: addTrack resolves with the new ID before React
    // batches the selectedTrackId state update. Without this, the effect
    // would read stale (null) selectedTrackId on first upload.
    trackId?: string
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

    // Guard: discard result if user navigated away during the async call
    if (selectedTrackIdRef.current !== id) return;

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
      // Known issue #12: read-modify-write on matchExplanations is not atomic.
      // Two rapid clicks could cause one write to overwrite the other.
      // Low probability in practice — see ARCHITECTURE.md known issues.
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