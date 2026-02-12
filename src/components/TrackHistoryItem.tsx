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

const sceneColors = {
  'Montage & Narrative': 'bg-blue-100 text-blue-700 border-blue-200',
  'Drama & Emotional': 'bg-purple-100 text-purple-700 border-purple-200',
  'Action & Intensity': 'bg-red-100 text-red-700 border-red-200',
  'Ambiance & Texture': 'bg-green-100 text-green-700 border-green-200',
};

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

  const confidencePercent = Math.round(track.prediction.confidence * 100);
  const sceneColorClass = sceneColors[track.prediction.sceneType as keyof typeof sceneColors] || 'bg-gray-100 text-gray-700 border-gray-200';

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
      aria-label={`${track.fileName}, ${track.prediction.sceneType}, ${confidencePercent}% confidence`}
    >
      {/* Delete Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove(track.id);
        }}
        className="
          absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center
          bg-red-100 text-red-600 opacity-0 group-hover:opacity-100 hover:bg-red-200
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
              {formatFileSize(track.fileSize)} • {formatDuration(track.duration)}
            </p>
          </div>
        </div>

        {/* Scene Classification */}
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <span className={`
            inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border
            ${sceneColorClass}
          `}>
            {track.prediction.sceneType}
          </span>
          <span className={`text-xs ${isSelected ? 'text-gray-700' : 'text-gray-400'}`}>
            {confidencePercent}% confidence
          </span>
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