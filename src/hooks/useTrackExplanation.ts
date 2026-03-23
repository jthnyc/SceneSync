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
      if (message === 'RATE_LIMITED') {
        setError('Explanation service is busy — try again in a moment.');
      } else if (message.includes('Missing API key')) {
        setError('Explanation unavailable — API key not configured.');
      } else {
        setError('Could not generate explanation. Try again in a moment.');
      }
      console.error('[useTrackExplanation]', err);
      return null;
    } finally {
      setIsExplaining(false);
    }
  }, []);

  // Error handling is duplicated between explain() and explainMatch()
  // intentionally — keeps each path self-contained so console logs identify
  // which function errored, and avoids a shared helper that obscures the call site.
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
      if (message === 'RATE_LIMITED') {
        setError('Explanation service is busy — try again in a moment.');
      } else if (message.includes('Missing API key')) {
        setError('Explanation unavailable — API key not configured.');
      } else {
        setError('Could not generate explanation. Try again in a moment.');
      }
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