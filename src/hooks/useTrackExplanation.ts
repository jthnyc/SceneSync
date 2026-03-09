// ── useTrackExplanation ───────────────────────────────────────────────────
// Both explain() and explainMatch() return their result string directly
// so the component can cache at the right moment, not via useEffect.
// This avoids the race condition where isMatchMode flips during async resolution
// and match text ends up overwriting the reference cache.

import { useState, useCallback } from 'react';
import { FeatureVector } from '../workers/featureExtraction.types';
import { explanationService } from '../services/explanationService';

export const useTrackExplanation = () => {
  const [explanation, setExplanation] = useState<string | null>(null);
  const [isExplaining, setIsExplaining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const explain = useCallback(async (featureVector: FeatureVector | null): Promise<string | null> => {
    if (!featureVector) {
      setError('No track analyzed yet — drop a reference track first.');
      return null;
    }

    setIsExplaining(true);
    setError(null);
    setExplanation(null);

    try {
      const result = await explanationService.explain(featureVector);
      setExplanation(result);
      return result; // returned so component can cache it directly
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(
        message.includes('Missing API key')
          ? 'Explanation unavailable — API key not configured.'
          : 'Could not generate explanation. Try again in a moment.'
      );
      console.error('[useTrackExplanation]', err);
      return null;
    } finally {
      setIsExplaining(false);
    }
  }, []);

  const explainMatch = useCallback(async (
    referenceVector: FeatureVector | null,
    matchVector: FeatureVector | null
  ): Promise<string | null> => {
    if (!referenceVector || !matchVector) {
      setError('Missing feature data — try re-uploading your reference track.');
      return null;
    }

    setIsExplaining(true);
    setError(null);
    setExplanation(null);

    try {
      const result = await explanationService.explainMatch(referenceVector, matchVector);
      setExplanation(result);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(
        message.includes('Missing API key')
          ? 'Explanation unavailable — API key not configured.'
          : 'Could not generate explanation. Try again in a moment.'
      );
      console.error('[useTrackExplanation.explainMatch]', err);
      return null;
    } finally {
      setIsExplaining(false);
    }
  }, []);

  const reset = useCallback(() => {
    setExplanation(null);
    setError(null);
    setIsExplaining(false);
  }, []);

  return {
    explanation,
    isExplaining,
    error,
    explain,
    explainMatch,
    reset,
  };
};