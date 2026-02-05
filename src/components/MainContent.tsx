import React from 'react';
import { PredictionResult } from '../hooks/useScenePrediction';
import { Clock, Target } from 'lucide-react';
import { formatFileSize, formatDuration } from '../utils/formatUtils';
import {
  UploadZone,
  FeatureVisualizations,
  SkeletonCard,
  ErrorDisplay,
  AudioPlayer,
} from './';
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

      {/* Audio Player - Handles all file info display when shown */}
      {selectedFile && !error && !isPredicting && (
        <div className="mt-4">
          <AudioPlayer
            audioFile={selectedFile}
            fileName={selectedFile.name}
            fileSize={selectedFile.size}
            onClear={onClearFile}
          />
        </div>
      )}

      {/* Show basic file info while predicting (no player) */}
      {selectedFile && !error && isPredicting && (
        <div className="mt-4 bg-gray-700/30 p-4 rounded-lg">
          <div className="text-sm text-gray-400 mb-1">Analyzing</div>
          
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="text-white font-medium truncate">
              {selectedFile.name}
            </div>
            
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
      )}

      {/* Viewing from history (no player available) */}
      {selectedTrackId && !selectedFile && currentTrack && !error && (
        <div className="mt-4 space-y-3">
          <div className="bg-gray-700/30 p-4 rounded-lg">
            <div className="text-sm text-gray-400 mb-1">Viewing from history</div>
            
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="text-white font-medium truncate">
                {currentTrack.fileName}
              </div>
              
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

          <div className="bg-gray-700/30 p-4 rounded-lg border border-gray-600">
            <div className="text-sm text-gray-400">
              💡 To play this track again, re-upload the file
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      {displayResult && !isPredicting && !error && (
        <div 
          className={`
            mt-6 grid grid-cols-2 gap-3 sm:gap-4
            transition-all duration-200 ease-out
            ${showResults ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}
          `}
        >
          <div className="bg-gray-700/30 p-3 sm:p-4 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="text-blue-400" size={16} />
              <div className="text-xs sm:text-sm text-gray-400">Processing</div>
            </div>
            <div className="text-xl sm:text-2xl font-bold text-blue-300">
              {(displayResult.processingTime / 1000).toFixed(2)}s
            </div>
          </div>

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