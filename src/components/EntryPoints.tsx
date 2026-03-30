// ── EntryPoints.tsx ───────────────────────────────────────────────────────
// Displays three curated entry point cards above the UploadZone.
// Visible only when no track is loaded. Disappears once analysis starts.
//
// Owns no state or data fetching — calls onSelect and shows a loading
// indicator per card while the parent fetches audio from R2.

import React from 'react';
import { Loader2, ArrowRight } from 'lucide-react';
import { ENTRY_POINTS } from '../config/entryPoints';
import type { EntryPoint } from '../config/entryPoints';

interface EntryPointsProps {
  onSelect: (entryPoint: EntryPoint) => void;
  loadingZone: string | null; // zone name of the card currently loading
}

const ZONE_COLORS: Record<string, string> = {
  'Driving & Tense':      'text-rose-400',
  'Gentle & Melodic':     'text-sky-400',
  'Sparse & Understated': 'text-emerald-400',
};

const EntryPoints: React.FC<EntryPointsProps> = ({ onSelect, loadingZone }) => {
  return (
    <div className="mb-4">
      <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">
        Or start with a sample reference
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {ENTRY_POINTS.map((ep) => {
          const isLoading = loadingZone === ep.zone;
          const isDisabled = loadingZone !== null;
          const zoneColor = ZONE_COLORS[ep.zone] ?? 'text-gray-400';

          return (
            <button
              key={ep.zone}
              onClick={() => !isDisabled && onSelect(ep)}
              disabled={isDisabled}
              aria-label={`Use ${ep.trackName} by ${ep.artist} as reference — ${ep.zone}`}
              className={`
                text-left p-3 rounded-lg border transition-all
                bg-gray-800/60 border-gray-700
                hover:border-gray-500 hover:bg-gray-700/60
                focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-gray-900
                disabled:opacity-50 disabled:cursor-not-allowed
                ${isLoading ? 'border-gray-500' : ''}
              `}
            >
              {/* Zone label */}
              <div className={`text-xs font-semibold uppercase tracking-wider mb-1 ${zoneColor}`}>
                {ep.zone}
              </div>

              {/* Track name + artist */}
              <div className="text-sm font-medium text-gray-200 leading-tight truncate">
                {ep.trackName}
              </div>
              <div className="text-xs text-gray-400 truncate mb-2">
                {ep.artist}
              </div>

              {/* Descriptor + action */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500 leading-tight">
                  {ep.descriptor}
                </span>
                {isLoading ? (
                  <Loader2 size={12} className="text-gray-400 animate-spin flex-shrink-0 ml-2" />
                ) : (
                  <ArrowRight size={12} className="text-gray-600 flex-shrink-0 ml-2" />
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default EntryPoints;