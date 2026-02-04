import React from 'react';
import { PredictionResult } from '../hooks/useScenePrediction';
import UploadZone from './UploadZone';
import { FeatureVisualizations } from './FeatureVisualizations';
import { SkeletonCard } from './Skeleton';
import { Clock, Target } from 'lucide-react';
import ErrorDisplay from './ErrorDisplay';
import type { ErrorState } from '../hooks/useScenePrediction';

interface Track {
  id: string;
  fileName: string;
  fileSize: number;
  timestamp: number;
  result: PredictionResult;
}

interface MainContentProps {
  selectedFile: File | null;
  selectedTrackId: string | null;
  trackHistory: Track[];
  displayResult: PredictionResult | undefined;
  isPredicting: boolean;
  isLoading: boolean;
  hasError: boolean;
  error: ErrorState | null;
  showResults: boolean;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onFileDrop: (e: React.DragEvent) => void;
  onClearFile: () => void;
  onRetry?: () => void;
  onDismissError?: () => void;
}

const MainContent: React.FC<MainContentProps> = ({
  selectedFile,
  selectedTrackId,
  trackHistory,
  displayResult,
  isPredicting,
  isLoading,
  hasError,
  error,
  showResults,
  onFileChange,
  onFileDrop,
  onClearFile,
  onRetry,
  onDismissError,
}) => {
  // Format file size
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  // Format audio duration
  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  // Get current track info (for viewing from history)
  const currentTrack = selectedTrackId 
    ? trackHistory.find(t => t.id === selectedTrackId)
    : null;

  return (
    <div className="lg:col-span-2 bg-gray-800/50 p-4 sm:p-6 rounded-xl border border-gray-700">
      <h2 className="text-xl font-semibold mb-4 text-primary-400">Upload Audio</h2>
      
      {/* Upload Zone */}
      <UploadZone
        onFileChange={onFileChange}
        onFileDrop={onFileDrop}
        isPredicting={isPredicting}
        isLoading={isLoading}
        hasError={hasError}
      />

      {/* Error Display */}
      {error && (
        <div className="mt-4">
          <ErrorDisplay
            message={error.message}
            type={error.type}
            severity="error"
            canRetry={error.canRetry}
            onRetry={onRetry}
            onDismiss={onDismissError}
          />
        </div>
      )}

      {/* Current File Info */}
      {selectedFile && !error && (
        <div className="mt-4 bg-gray-700/30 p-4 rounded-lg">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="text-sm text-gray-400 mb-1">
                {isPredicting ? 'Analyzing' : 'Current file'}
              </div>
              
              {/* Desktop: filename and metadata on same row */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="text-white font-medium truncate">
                  {selectedFile.name}
                </div>
                
                {/* File metadata */}
                {displayResult?.audioDuration && (
                  <div className="flex items-center gap-3 text-sm flex-shrink-0">
                    <span className="text-gray-400">{formatFileSize(selectedFile.size)}</span>
                    <span className="text-gray-600">•</span>
                    <span className="text-white font-medium">
                      {formatDuration(displayResult.audioDuration)}
                    </span>
                  </div>
                )}
              </div>
            </div>
            
            {!isPredicting && (
              <button
                onClick={onClearFile}
                className="text-sm text-blue-400 hover:text-blue-300 transition-colors flex-shrink-0"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {/* Viewing from history */}
      {selectedTrackId && !selectedFile && currentTrack && !error && (
        <div className="mt-4 bg-gray-700/30 p-4 rounded-lg">
          <div className="text-sm text-gray-400 mb-1">Viewing from history</div>
          
          {/* Desktop: filename and metadata on same row */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="text-white font-medium truncate">
              {currentTrack.fileName}
            </div>
            
            {/* File metadata */}
            {displayResult?.audioDuration && (
              <div className="flex items-center gap-3 text-sm flex-shrink-0">
                <span className="text-gray-400">{formatFileSize(currentTrack.fileSize)}</span>
                <span className="text-gray-600">•</span>
                <span className="text-white font-medium">
                  {formatDuration(displayResult.audioDuration)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stats - Only 2 cards: Processing Time & Confidence */}
      {displayResult && !isPredicting && !error && (
        <div 
          className={`
            mt-6 grid grid-cols-2 gap-3 sm:gap-4
            transition-all duration-200 ease-out
            ${showResults ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}
          `}
        >
          {/* Processing Time */}
          <div className="bg-gray-700/30 p-3 sm:p-4 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="text-blue-400" size={16} />
              <div className="text-xs sm:text-sm text-gray-400">Processing</div>
            </div>
            <div className="text-xl sm:text-2xl font-bold text-blue-300">
              {(displayResult.processingTime / 1000).toFixed(2)}s
            </div>
          </div>

          {/* Confidence */}
          <div className="bg-gray-700/30 p-3 sm:p-4 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <Target className="text-green-400" size={16} />
              <div className="text-xs sm:text-sm text-gray-400">Confidence</div>
            </div>
            <div className="text-xl sm:text-2xl font-bold text-green-300">
              {(displayResult.confidence * 100).toFixed(0)}%
            </div>
          </div>
        </div>
      )}

      {/* Visualizations - Skeleton while predicting */}
      {isPredicting && !displayResult && (
        <div className="mt-6 space-y-6">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {/* Visualizations - Actual charts */}
      {displayResult && !isPredicting && !error && (
        <div 
          className={`
            mt-6 transition-all duration-200 ease-out
            ${showResults ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}
          `}
        >
          <FeatureVisualizations 
            timeSeries={displayResult.timeSeries} 
            sceneType={displayResult.sceneType}
          />
        </div>
      )}
    </div>
  );
};

export default MainContent;