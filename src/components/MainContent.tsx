import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { PredictionResult } from '../hooks/useScenePrediction';
import { Clock, Target } from 'lucide-react';
import { formatFileSize, formatDuration } from '../utils/formatUtils';
import { audioStorage } from '../services/audioStorageService';
import {
  UploadZone,
  FeatureVisualizations,
  SkeletonCard,
  ErrorDisplay,
  AudioPlayer,
} from './';
import type { ErrorState } from '../hooks/useScenePrediction';
import type { AnalyzedTrack } from '../types/audio';

interface MainContentProps {
  selectedFile: File | null;
  selectedTrackId: string | null;
  trackHistory: AnalyzedTrack[];
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
  const [historyAudioFile, setHistoryAudioFile] = useState<File | null>(null);
  const [loadingHistoryAudio, setLoadingHistoryAudio] = useState(false);

  const currentTrack = selectedTrackId 
    ? trackHistory.find(t => t.id === selectedTrackId)
    : null;

  // Load audio from IndexedDB when viewing from history
  useEffect(() => {
    if (selectedTrackId && !selectedFile && currentTrack?.hasStoredAudio) {
      setLoadingHistoryAudio(true);
      // Reset immediately so stale audio from a previous track never lingers
      setHistoryAudioFile(null);
      audioStorage.getAudioFile(selectedTrackId)
        .then((file) => {
          if (file) {
            setHistoryAudioFile(file);
          }
        })
        .catch((err) => {
          console.error('Failed to load audio from storage:', err);
          setHistoryAudioFile(null);
          toast.error('Could not load audio from storage. Try re-uploading the file.', {
            duration: 4000,
          });
        })
        .finally(() => {
          setLoadingHistoryAudio(false);
        });
    } else {
      setHistoryAudioFile(null);
    }
  }, [selectedTrackId, selectedFile, currentTrack]);

  // Determine which file to show in player
  // const audioFileToPlay = selectedFile || historyAudioFile;

  return (
    <div className="lg:col-span-2 lg:order-2 bg-gray-800/50 p-4 sm:p-6 rounded-xl border border-gray-700">
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

      {/* Audio Player - Newly uploaded file */}
      {selectedFile && !error && !isPredicting && (
        <div className="mt-4">
          <AudioPlayer
            audioFile={selectedFile}
            fileName={selectedFile.name}
            fileSize={selectedFile.size}
          />
        </div>
      )}

      {/* Audio Player - From history (loaded from IndexedDB) */}
      {!selectedFile && historyAudioFile && currentTrack && !error && !isPredicting && (
        <div className="mt-4">
          <AudioPlayer
            audioFile={historyAudioFile}
            fileName={currentTrack.fileName}
            fileSize={currentTrack.fileSize}
          />
        </div>
      )}

      {/* Loading state for history audio */}
      {loadingHistoryAudio && !selectedFile && (
        <div className="mt-4 bg-gray-700/30 p-4 rounded-lg">
          <div className="text-sm text-gray-400 mb-2">Loading audio from storage...</div>
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div className="bg-blue-500 h-2 rounded-full animate-pulse" style={{ width: '60%' }} />
          </div>
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

      {/* Viewing from history - file not available in storage */}
      {selectedTrackId && !selectedFile && !historyAudioFile && !loadingHistoryAudio && currentTrack && !error && (
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

          <div className="bg-amber-900/20 p-4 rounded-lg border border-amber-700/50">
            <div className="text-sm text-amber-200">
              ⚠️ Audio file not available in storage. Re-upload to play this track.
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