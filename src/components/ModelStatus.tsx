import React from 'react';
import { CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import { Skeleton, SkeletonText } from './Skeleton';

interface ModelStatusProps {
  isLoading: boolean;
  isModelLoaded: boolean;
  error: string | null;
  onRetry: () => void;
}

const ModelStatus: React.FC<ModelStatusProps> = ({ 
  isLoading, 
  isModelLoaded, 
  error, 
  onRetry 
}) => {
  if (isLoading) {
    return (
      <div className="mb-6 space-y-4">
        <Skeleton className="h-8 w-48 mb-4" />
        <div className="bg-gray-700/50 p-4 rounded-lg">
          <Skeleton className="h-6 w-24 mb-3" />
          <Skeleton className="h-8 w-full mb-2" />
          <SkeletonText lines={2} />
        </div>
      </div>
    );
  }

  if (isModelLoaded && !error) {
    return (
      <div className="mb-6">
        <div className="flex items-center gap-2 text-green-400">
          <CheckCircle size={20} />
          <span>Model ready</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mb-6">
        <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <XCircle className="text-red-400 flex-shrink-0 mt-0.5" size={20} />
            <div className="flex-1">
              <div className="text-red-400 font-semibold mb-1">Error Loading Model</div>
              <p className="text-red-300 text-sm mb-3">{error}</p>
              <button
                onClick={onRetry}
                disabled={isLoading}
                className="flex items-center gap-2 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 
                         border border-red-500/50 rounded-lg text-sm text-red-300 
                         transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
                {isLoading ? 'Retrying...' : 'Retry'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default ModelStatus;
