import React from 'react';
import { Music, Trash2 } from 'lucide-react';
import { formatFileSize, formatDuration } from '../utils/formatUtils';
import type { AnalyzedTrack } from '../types/audio';

interface TrackHistoryItemProps {
  track: AnalyzedTrack;
  isSelected: boolean;
  onSelect: (trackId: string) => void;
  onRemove: (trackId: string) => void;
}

export function TrackHistoryItem({
  track,
  isSelected,
  onSelect,
  onRemove,
}: TrackHistoryItemProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(track.id);
    } else if (e.key === 'Delete') {
      e.preventDefault();
      onRemove(track.id);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(track.id)}
      onKeyDown={handleKeyDown}
      className={`
        group relative p-4 rounded-lg border-2 transition-all cursor-pointer
        ${isSelected
          ? 'border-blue-500 bg-blue-50'
          : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
        }
        focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
      `}
      aria-label={track.fileName}
    >
      {/* Delete Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove(track.id);
        }}
        className="
          absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center
        bg-red-100 text-red-600 hover:bg-red-200
          sm:opacity-0 sm:group-hover:opacity-100
          transition-opacity focus:outline-none focus:ring-2 focus:ring-red-500 focus:opacity-100
        "
        aria-label={`Delete ${track.fileName}`}
      >
        <Trash2 className="w-4 h-4" />
      </button>

      {/* Content */}
      <div className="pr-10">
        {/* File Info */}
        <div className="flex items-start gap-2 mb-2">
          <Music className={`w-4 h-4 mt-1 flex-shrink-0 ${isSelected ? 'text-gray-600' : 'text-gray-400'}`} />
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-medium truncate ${isSelected ? 'text-gray-900' : 'text-gray-100'}`}>
              {track.fileName}
            </p>
            <p className={`text-xs ${isSelected ? 'text-gray-600' : 'text-gray-400'}`}>
              {formatFileSize(track.fileSize)}{track.duration ? ` • ${formatDuration(track.duration)}` : null}
            </p>
          </div>
        </div>

        {/* Timestamp */}
        <div className={`text-xs ${isSelected ? 'text-gray-600' : 'text-gray-500'}`}>
          {new Date(track.analyzedAt).toLocaleString()}
        </div>

        {/* Unsaved indicator — shown when blob failed to write to IDB */}
        {!track.hasStoredAudio && (
          <p className="text-xs text-amber-500 mt-1">
            Not saved · won't be available after refresh
          </p>
        )}
      </div>
    </div>
  );
}
