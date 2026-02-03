import React from 'react';
import TrackHistoryItem from './TrackHistoryItem';

interface Track {
  id: string;
  fileName: string;
  timestamp: number;
  result: {
    sceneType: string;
  };
}

interface TrackHistoryProps {
  tracks: Track[];
  selectedTrackId: string | null;
  onSelectTrack: (id: string) => void;
  onRemoveTrack: (id: string) => void;
  onClearAll: () => void;
}

const TrackHistory: React.FC<TrackHistoryProps> = ({
  tracks,
  selectedTrackId,
  onSelectTrack,
  onRemoveTrack,
  onClearAll,
}) => {
  if (tracks.length === 0) {
    return null;
  }

  return (
    <div className="mt-6 border-t border-gray-700 pt-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-300">Track History</h3>
        <button
          onClick={onClearAll}
          className="text-xs text-red-400 hover:text-red-300 transition-colors"
        >
          Clear All
        </button>
      </div>
      
      <div className="space-y-2">
        {tracks.map((track) => (
          <TrackHistoryItem
            key={track.id}
            id={track.id}
            fileName={track.fileName}
            sceneType={track.result.sceneType}
            timestamp={track.timestamp}
            isSelected={selectedTrackId === track.id}
            onSelect={() => onSelectTrack(track.id)}
            onRemove={() => onRemoveTrack(track.id)}
          />
        ))}
      </div>
    </div>
  );
};

export default TrackHistory;
