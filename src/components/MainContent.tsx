import React from 'react';
import { PredictionResult } from '../hooks/useScenePrediction';
import UploadZone from './UploadZone';
import { FeatureVisualizations } from './FeatureVisualizations';
import { SkeletonCard } from './Skeleton';

interface Track {
  id: string;
  fileName: string;
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
  showResults: boolean;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onFileDrop: (e: React.DragEvent) => void;
  onClearFile: () => void;
}

const MainContent: React.FC<MainContentProps> = ({
  selectedFile,
  selectedTrackId,
  trackHistory,
  displayResult,
  isPredicting,
  isLoading,
  hasError,
  showResults,
  onFileChange,
  onFileDrop,
  onClearFile,
}) => {
  return (
    <div className="lg:col-span-2 bg-gray-800/50 p-6 rounded-xl border border-gray-700">
      <h2 className="text-xl font-semibold mb-4 text-primary-400">Upload Audio</h2>
      
      {/* Upload Zone */}
      <UploadZone
        onFileChange={onFileChange}
        onFileDrop={onFileDrop}
        isPredicting={isPredicting}
        isLoading={isLoading}
        hasError={hasError}
      />

      {/* File Info */}
      {selectedFile && (
        <div className="mt-4 bg-gray-700/30 p-4 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-400">
                {isPredicting ? 'Analyzing' : 'Current file'}
              </div>
              <div className="text-white font-medium">
                {selectedFile.name}
              </div>
            </div>
            {!isPredicting && (
              <button
                onClick={onClearFile}
                className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {/* Viewing from history */}
      {selectedTrackId && !selectedFile && (
        <div className="mt-4 bg-gray-700/30 p-4 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-400">Viewing from history</div>
              <div className="text-white font-medium">
                {trackHistory.find(t => t.id === selectedTrackId)?.fileName}
              </div>
            </div>
            <button
              onClick={onClearFile}
              className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Feature Info Cards */}
      <div className="mt-6 grid grid-cols-2 gap-4">
        <div className="bg-gray-700/30 p-4 rounded-lg">
          <div className="text-sm text-gray-400 mb-1">Features Extracted</div>
          <div className="text-2xl font-bold text-primary-300">44</div>
          <div className="text-xs text-gray-500 mt-1">
            Spectral, Temporal, Timbral
          </div>
        </div>
        <div className="bg-gray-700/30 p-4 rounded-lg">
          <div className="text-sm text-gray-400 mb-1">Scene Categories</div>
          <div className="text-2xl font-bold text-primary-300">4</div>
          <div className="text-xs text-gray-500 mt-1">
            Action, Dialogue, Suspense, Romance
          </div>
        </div>
      </div>

      {/* Visualizations - Skeleton while predicting */}
      {isPredicting && !displayResult && (
        <div className="mt-6 space-y-6">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {/* Visualizations - Actual charts */}
      {displayResult && !isPredicting && (
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
