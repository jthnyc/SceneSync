// Renders the top-N similarity matches after a user drops a reference track.
// Each card shows: track title, subtitle, source, and similarity score.
//
// Score display: cosine similarity is 0–1, but in practice cinematic tracks
// rarely score below 0.7 against each other — raw numbers feel opaque.
// We show a percentage bar capped at the top score so relative differences
// are clear, plus a plain-language label for the top match.

import React from 'react';
import { Music2 } from 'lucide-react';
import type { SimilarityResult } from '../services/similarityService';
import { parseTrackDisplay } from '../utils/parseTrackDisplay';

interface SimilarityResultsProps {
  results: SimilarityResult[];
  isSearching: boolean;
}

// Map similarity score to a short human-readable label.
// These thresholds were chosen based on observed score distribution
// across the 243-track library — adjust after more real-world testing.
function matchLabel(score: number, isTop: boolean): string {
  if (isTop) return 'Closest match';
  if (score >= 0.92) return 'Very close';
  if (score >= 0.85) return 'Strong match';
  if (score >= 0.75) return 'Good match';
  return 'Partial match';
}

const SimilarityResults: React.FC<SimilarityResultsProps> = ({ results, isSearching }) => {
  if (isSearching) {
    return (
      <div className="mt-6 space-y-3">
        <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide">
          Finding similar tracks...
        </h3>
        {[0, 1, 2].map(i => (
          <div
            key={i}
            className="bg-gray-700/30 rounded-lg p-4 animate-pulse"
            style={{ opacity: 1 - i * 0.2 }}
          >
            <div className="h-4 bg-gray-600/50 rounded w-2/3 mb-2" />
            <div className="h-3 bg-gray-600/30 rounded w-1/3" />
          </div>
        ))}
      </div>
    );
  }

  if (results.length === 0) return null;

  // Normalize bar widths against the top score so relative differences show
  const topScore = results[0].score;

  return (
    <div className="mt-6">
      <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-3">
        Royalty-free matches
      </h3>

      <div className="space-y-3">
        {results.map((result, i) => {
          const { title, subtitle, source } = parseTrackDisplay(result.file);
          const barWidth = topScore > 0 ? (result.score / topScore) * 100 : 0;
          const isTop = i === 0;

          return (
            <div
              key={result.file}
              className={`
                rounded-lg p-4 transition-colors
                ${isTop
                  ? 'bg-primary-900/30 border border-primary-700/50'
                  : 'bg-gray-700/30 border border-gray-700/30'
                }
              `}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <Music2
                    size={16}
                    className={`mt-0.5 flex-shrink-0 ${isTop ? 'text-primary-400' : 'text-gray-500'}`}
                  />
                  <div className="min-w-0">
                    <div className={`font-medium truncate text-sm ${isTop ? 'text-white' : 'text-gray-200'}`}>
                      {title}
                    </div>
                    {subtitle && (
                      <div className="text-xs text-gray-400 truncate mt-0.5">
                        {subtitle}
                      </div>
                    )}
                    <div className="text-xs text-gray-500 mt-1">
                      {source}
                    </div>
                  </div>
                </div>

                <div className="flex-shrink-0 text-right">
                  <div className={`text-xs font-medium ${isTop ? 'text-primary-400' : 'text-gray-400'}`}>
                    {matchLabel(result.score, isTop)}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {(result.score * 100).toFixed(0)}% similar
                  </div>
                </div>
              </div>

              {/* Similarity bar */}
              <div className="mt-3 bg-gray-700/50 rounded-full h-1">
                <div
                  className={`h-1 rounded-full transition-all duration-500 ${
                    isTop ? 'bg-primary-500' : 'bg-gray-500'
                  }`}
                  style={{ width: `${barWidth}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-gray-600 mt-3">
        Matched by acoustic fingerprint — energy, timbre, brightness, and harmonic content.
      </p>
    </div>
  );
};

export default SimilarityResults;