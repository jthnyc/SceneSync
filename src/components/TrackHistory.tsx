import React from 'react';
import { TrackHistoryItem } from './TrackHistoryItem';
import type { AnalyzedTrack } from '../types/audio';

interface TrackHistoryProps {
  tracks: AnalyzedTrack[];
  selectedTrackId: string | null;  // Changed back from activeTrackId
  onSelectTrack: (id: string) => void;  // Changed back from onPlayTrack
  onRemoveTrack: (id: string) => void;  // Changed back from onDeleteTrack
  onClearAll: () => void;
}

const TrackHistory: React.FC<TrackHistoryProps> = ({
  tracks,
  selectedTrackId,  // Changed back
  onSelectTrack,    // Changed back
  onRemoveTrack,    // Changed back
  onClearAll,
}) => {
  if (tracks.length === 0) {
    return null;
  }

  return (
    <nav
      className="mt-6 border-t border-gray-700 pt-4"
      aria-label="Track history"
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-300">
          Track History
          <span className="sr-only">
            {tracks.length} {tracks.length === 1 ? 'track' : 'tracks'}
          </span>
        </h3>
        <button
          onClick={onClearAll}
          aria-label={`Clear all ${tracks.length} tracks from history`}
          className="
            text-xs text-red-400 hover:text-red-300 transition-colors
            focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-gray-800
            px-2 py-1 rounded
          "
        >
          Clear All
        </button>
      </div>
      
      <ul className="space-y-2">
        {tracks.map((track) => (
          <li key={track.id}>
            <TrackHistoryItem
              track={track}
              isSelected={selectedTrackId === track.id}
              onSelect={onSelectTrack}
              onRemove={onRemoveTrack}
            />
          </li>
        ))}
      </ul>
    </nav>
  );
};

export default TrackHistory;