import React from 'react';
import { X } from 'lucide-react';

interface TrackHistoryItemProps {
  id: string;
  fileName: string;
  sceneType: string;
  timestamp: number;
  isSelected: boolean;
  onSelect: () => void;
  onRemove: () => void;
}

const TrackHistoryItem: React.FC<TrackHistoryItemProps> = ({
  id,
  fileName,
  sceneType,
  timestamp,
  isSelected,
  onSelect,
  onRemove,
}) => {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      onRemove();
    }
  };

  const handleRemoveKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      onRemove();
    }
  };

  const timeAgo = () => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${fileName}, ${sceneType} scene, analyzed ${timeAgo()}. Press Enter to view details, Delete to remove.`}
      aria-pressed={isSelected}
      onKeyDown={handleKeyDown}
      onClick={onSelect}
      className={`
        group p-3 rounded-lg cursor-pointer transition-all
        focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-gray-800
        ${isSelected 
          ? 'bg-primary-500/20 border border-primary-500' 
          : 'bg-gray-700/30 hover:bg-gray-700/50 border border-transparent'
        }
      `}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-sm text-white truncate font-medium">
            {fileName}
          </div>
          <div className="text-xs text-gray-400 mt-1">
            {sceneType} • {timeAgo()}
          </div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          onKeyDown={handleRemoveKeyDown}
          aria-label={`Remove ${fileName} from history`}
          className="
            opacity-0 group-hover:opacity-100 group-focus-within:opacity-100
            text-gray-400 hover:text-red-400 transition-all
            p-1 rounded
            focus:outline-none focus:ring-2 focus:ring-red-500 focus:opacity-100
          "
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};

export default TrackHistoryItem;