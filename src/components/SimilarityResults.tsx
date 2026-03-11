import React from 'react';
import { Music2 } from 'lucide-react';
import type { SimilarityResult } from '../services/similarityService';
import { parseTrackDisplay } from '../utils/parseTrackDisplay';
import { RANK_CONFIG } from '../config/rankConfig';

interface SimilarityResultsProps {
  results: SimilarityResult[];
  isSearching: boolean;
  onSelectMatch?: (result: SimilarityResult) => void;
  activeMatchId?: string;
  compact?: boolean;
}

const SimilarityResults: React.FC<SimilarityResultsProps> = ({
  results,
  isSearching,
  onSelectMatch,
  activeMatchId,
  compact = false,
}) => {
  if (isSearching) {
    return (
      <div className={compact ? 'space-y-2' : 'mt-6 space-y-3'}>
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

  return (
    <div className={compact ? 'mt-6' : ''}>
      <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-3">
        Royalty-free matches
      </h3>

      <div className="space-y-2">
        {results.map((result, i) => {
          const { title, subtitle, source } = parseTrackDisplay(result.file);
          const rank = RANK_CONFIG[Math.min(i, RANK_CONFIG.length - 1)];
          const isActive = activeMatchId === result.file;

          return (
            <div
              key={result.file}
              onClick={() => onSelectMatch?.(result)}
              className={`
                border-l-4 ${rank.border} rounded-r-lg
                ${compact ? 'p-3' : 'p-4'}
                transition-all cursor-pointer
                ${isActive
                  ? 'bg-gray-700/60 ring-1 ring-gray-500'
                  : 'bg-gray-700/30 hover:bg-gray-700/50'
                }
              `}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 min-w-0">
                  <Music2
                    size={14}
                    className={`mt-0.5 flex-shrink-0 ${rank.text}`}
                  />
                  <div className="min-w-0">
                    <div className="font-medium truncate text-sm text-white">
                      {title}
                    </div>
                    {!compact && subtitle && (
                      <div className="text-xs text-gray-400 truncate mt-0.5">
                        {subtitle}
                      </div>
                    )}
                    {!compact && (
                      <div className="text-xs text-gray-500 mt-1">{source}</div>
                    )}
                    {compact && subtitle && (
                      <div className="text-xs text-gray-400 truncate mt-0.5">
                        {subtitle}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex-shrink-0 text-right">
                  <div className={`text-xs font-medium ${rank.text}`}>
                    {rank.label}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {(result.score * 100).toFixed(0)}%
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {!compact && (
        <p className="text-xs text-gray-600 mt-3">
          Matched by acoustic fingerprint — energy, timbre, brightness, and harmonic content.
        </p>
      )}
    </div>
  );
};

export default SimilarityResults;