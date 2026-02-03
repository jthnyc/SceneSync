import React from 'react';

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
  fileName,
  sceneType,
  timestamp,
  isSelected,
  onSelect,
  onRemove,
}) => {
  return (
    <div
      className={`
        p-3 rounded-lg cursor-pointer transition-all duration-200
        ${isSelected 
          ? 'bg-primary-500/20 border border-primary-500 scale-[1.02]' 
          : 'bg-gray-700/30 hover:bg-gray-700/50 border border-transparent'
        }
      `}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-sm text-white truncate">{fileName}</div>
          <div className="text-xs text-gray-400 mt-1">{sceneType}</div>
          <div className="text-xs text-gray-500">
            {new Date(timestamp).toLocaleTimeString()}
          </div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="text-gray-400 hover:text-red-400 transition-colors"
        >
          ✕
        </button>
      </div>
    </div>
  );
};

export default TrackHistoryItem;
