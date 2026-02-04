import React from 'react';
import { Loader2 } from 'lucide-react';

interface ProgressIndicatorProps {
  progress: number;
  stage: string;
  className?: string;
}

const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({ 
  progress, 
  stage, 
  className = '' 
}) => {
  return (
    <div className={`space-y-3 ${className}`}>
      {/* Stage Text */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <Loader2 className="text-primary-400 animate-spin" size={16} />
          <span className="text-gray-300">{stage}</span>
        </div>
        <span className="text-gray-400 font-mono">{progress}%</span>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
        <div
          className="bg-gradient-to-r from-primary-500 to-primary-400 h-2 rounded-full transition-all duration-300 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Stage Dots */}
      <div className="flex justify-between items-center pt-2">
        <div className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full transition-colors ${progress >= 30 ? 'bg-primary-400' : 'bg-gray-600'}`} />
          <span className="text-xs text-gray-500">Decode</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full transition-colors ${progress >= 80 ? 'bg-primary-400' : 'bg-gray-600'}`} />
          <span className="text-xs text-gray-500">Extract</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full transition-colors ${progress >= 100 ? 'bg-primary-400' : 'bg-gray-600'}`} />
          <span className="text-xs text-gray-500">Classify</span>
        </div>
      </div>
    </div>
  );
};

export default ProgressIndicator;