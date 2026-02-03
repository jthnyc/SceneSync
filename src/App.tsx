import React, { useEffect, useState } from 'react';
import { Upload, CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import { useScenePrediction, PredictionResult } from './hooks/useScenePrediction';
import { FeatureVisualizations } from './components/FeatureVisualizations';
import { Skeleton, SkeletonText, SkeletonCard } from './components/Skeleton';
import './index.css';

interface TrackHistory {
  id: string;
  fileName: string;
  timestamp: number;
  result: PredictionResult;
}

function App() {
  const { 
    isLoading, 
    isPredicting, 
    error, 
    result, 
    initializeModel, 
    predictSceneType,
    isModelLoaded 
  } = useScenePrediction();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sceneDescriptions, setSceneDescriptions] = useState<{ [key: string]: string }>({});
  const [dragActive, setDragActive] = useState(false);
  const [trackHistory, setTrackHistory] = useState<TrackHistory[]>([]);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);

  const displayResult = selectedTrackId ? trackHistory.find(t => t.id === selectedTrackId)?.result : result;

  // Trigger fade-in animation when displayResult changes
  useEffect(() => {
    if (displayResult) {
      setShowResults(false);
      // Small delay to ensure CSS transition triggers
      const timer = setTimeout(() => setShowResults(true), 10);
      return () => clearTimeout(timer);
    } else {
      setShowResults(false);
    }
  }, [displayResult]);

  // Initialize model and load descriptions on mount
  useEffect(() => {
    const init = async () => {
      try {
        const descriptionsResponse = await fetch('/scene_descriptions.json');
        const descriptions = await descriptionsResponse.json();
        setSceneDescriptions(descriptions);
        await initializeModel();
      } catch (err) {
        console.error('Failed to load scene descriptions:', err);
      }
    };
    init();
  }, [initializeModel]);

  // Add track to history when result updates
  useEffect(() => {
    if (result && selectedFile) {
      const newTrack: TrackHistory = {
        id: Date.now().toString(),
        fileName: selectedFile.name,
        timestamp: Date.now(),
        result: result
      };
      
      // Only add if this exact result object isn't already in history
      setTrackHistory(prev => {
        // Check if the most recent track has this exact result object reference
        if (prev.length > 0 && prev[0].result === result) {
          return prev; // Skip - this result is already added
        }
        return [newTrack, ...prev];
      });
      setSelectedTrackId(newTrack.id);
    }
  }, [result, selectedFile]);

  // Save to localStorage whenever history changes
  useEffect(() => {
    localStorage.setItem('sceneSync_trackHistory', JSON.stringify(trackHistory));
  }, [trackHistory]);

  // Add track to history after prediction
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check if this file already exists in history
    const existingTrack = trackHistory.find(
      track => track.fileName === file.name && track.result
    );

    if (existingTrack) {
      // File already analyzed - just select it from history
      setSelectedTrackId(existingTrack.id);
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
    setSelectedTrackId(null); // Reset selection
    await predictSceneType(file);
  };

  const handleTryAnother = () => {
    setSelectedFile(null);
    setSelectedTrackId(null);
    // Reset file input
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('audio/')) {
      // Check if this file already exists in history
      const existingTrack = trackHistory.find(
        track => track.fileName === file.name && track.result
      );

      if (existingTrack) {
        // File already analyzed - just select it from history
        setSelectedTrackId(existingTrack.id);
        setSelectedFile(null);
        return;
      }

      setSelectedFile(file);
      setSelectedTrackId(null);
      await predictSceneType(file);
    }
  };

  const removeTrack = (id: string) => {
    setTrackHistory(prev => prev.filter(t => t.id !== id));
    if (selectedTrackId === id) {
      setSelectedTrackId(null);
      setSelectedFile(null);
    }
  };

  const clearAllTracks = () => {
    setTrackHistory([]);
    setSelectedTrackId(null);
    setSelectedFile(null);
  };

  const handleRetryModelInit = async () => {
    await initializeModel();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-black text-white p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-primary-500 mb-2">🎬 SceneSync</h1>
          <p className="text-gray-300">AI-Powered Film Music Scene Classifier</p>
        </div>

        {/* Model Status */}
        <div className="mb-6">
          {isLoading && (
              <div className="space-y-4">
                <Skeleton className="h-8 w-48 mb-4" />
                <div className="bg-gray-700/50 p-4 rounded-lg">
                  <Skeleton className="h-6 w-24 mb-3" />
                  <Skeleton className="h-8 w-full mb-2" />
                  <SkeletonText lines={2} />
                </div>
              </div>
          )}
          {isModelLoaded && !isLoading && (
            <div className="flex items-center gap-2 text-green-400">
              <CheckCircle size={20} />
              <span>Model ready</span>
            </div>
          )}
          {error && (
            <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <XCircle className="text-red-400 flex-shrink-0 mt-0.5" size={20} />
                <div className="flex-1">
                  <div className="text-red-400 font-semibold mb-1">Error Loading Model</div>
                  <p className="text-red-300 text-sm mb-3">{error}</p>
                  <button
                    onClick={handleRetryModelInit}
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
          )}
        </div>

        {/* Main Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Sidebar - Results & Track History */}
          <div className="lg:col-span-1 bg-gray-800/50 p-6 rounded-xl border border-gray-700">
            <h2 className="text-xl font-semibold mb-4 text-primary-400">Prediction Results</h2>
            
            {!displayResult && !isPredicting && trackHistory.length === 0 && (
              <p className="text-gray-500 text-sm">Upload an audio file to see results</p>
            )}

            {isPredicting && (
              <div className="space-y-4 mb-6">
                {/* Skeleton for Scene Type card */}
                <div className="bg-gray-700/50 p-4 rounded-lg">
                  <Skeleton className="h-4 w-20 mb-2" />
                  <Skeleton className="h-8 w-32 mb-3" />
                  <SkeletonText lines={2} />
                  <Skeleton className="h-4 w-24 mt-3" />
                </div>

                {/* Skeleton for All Probabilities */}
                <div>
                  <Skeleton className="h-4 w-32 mb-3" />
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="mb-3">
                      <div className="flex justify-between mb-1">
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-4 w-12" />
                      </div>
                      <Skeleton className="h-2 w-full" />
                    </div>
                  ))}
                </div>

                <Skeleton className="h-4 w-40" />
              </div>
            )}

            {displayResult && (
              <div 
                className={`
                  space-y-4 mb-6 transition-all duration-200 ease-out
                  ${showResults ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}
                `}
              >
                <div className="bg-gray-700/50 p-4 rounded-lg">
                  <div className="text-sm text-gray-400 mb-1">Scene Type</div>
                  <div className="text-2xl font-bold text-primary-400">
                    {displayResult.sceneType}
                  </div>
                  <p className="text-sm text-gray-300 mt-2 leading-relaxed">
                    {sceneDescriptions[displayResult.sceneType] || ""}
                  </p>
                  <div className="text-sm text-gray-400 mt-3">
                    {(displayResult.confidence * 100).toFixed(1)}% confidence
                  </div>
                </div>

                <div>
                  <div className="text-sm text-gray-400 mb-2">All Probabilities</div>
                  {Object.entries(displayResult.probabilities)
                    .sort(([, a], [, b]) => b - a)
                    .map(([type, prob]) => (
                      <div key={type} className="mb-2">
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-300">{type}</span>
                          <span className="text-gray-400">{(prob * 100).toFixed(1)}%</span>
                        </div>
                        <div className="w-full bg-gray-700 rounded-full h-2">
                          <div
                            className="bg-primary-500 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${prob * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                </div>

                <div className="text-xs text-gray-500 pt-2 border-t border-gray-700">
                  Processing time: {(displayResult.processingTime / 1000).toFixed(1)}s
                </div>
              </div>
            )}

            {/* Track History */}
            {trackHistory.length > 0 && (
              <div className="mt-6 border-t border-gray-700 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-300">Track History</h3>
                  <button
                    onClick={clearAllTracks}
                    className="text-xs text-red-400 hover:text-red-300 transition-colors"
                  >
                    Clear All
                  </button>
                </div>
                
                <div className="space-y-2">
                  {trackHistory.map((track) => (
                    <div
                      key={track.id}
                      className={`
                        p-3 rounded-lg cursor-pointer transition-all duration-200
                        ${selectedTrackId === track.id 
                          ? 'bg-primary-500/20 border border-primary-500 scale-[1.02]' 
                          : 'bg-gray-700/30 hover:bg-gray-700/50 border border-transparent'
                        }
                      `}
                      onClick={() => {
                        setSelectedTrackId(track.id);
                        setSelectedFile(null);
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-white truncate">{track.fileName}</div>
                          <div className="text-xs text-gray-400 mt-1">
                            {track.result.sceneType}
                          </div>
                          <div className="text-xs text-gray-500">
                            {new Date(track.timestamp).toLocaleTimeString()}
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeTrack(track.id);
                          }}
                          className="text-gray-400 hover:text-red-400 transition-colors"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Main Content - Upload Zone */}
          <div className="lg:col-span-2 bg-gray-800/50 p-6 rounded-xl border border-gray-700">
            <h2 className="text-xl font-semibold mb-4 text-primary-400">Upload Audio</h2>
            
            <label className="block">
              <div 
                className={`
                  border-2 border-dashed rounded-lg p-12 text-center cursor-pointer
                  transition-all hover:border-primary-500 hover:bg-gray-800/30
                  ${dragActive ? 'border-primary-500 bg-primary-500/10' : 'border-gray-600'}
                  ${isPredicting ? 'border-yellow-500 bg-yellow-500/10' : ''}
                  ${error && !isModelLoaded ? 'opacity-50 cursor-not-allowed' : ''}
                `}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <input
                  type="file"
                  accept="audio/*"
                  onChange={handleFileChange}
                  disabled={isPredicting || isLoading || (error !== null && !isModelLoaded)}
                  className="hidden"
                />
                <Upload className="mx-auto mb-4 text-gray-400" size={48} />
                <p className="text-lg mb-2">
                  {error && !isModelLoaded 
                    ? 'Model must be loaded before uploading' 
                    : 'Drop audio file here or click to browse'
                  }
                </p>
                <p className="text-sm text-gray-500">
                  Supports: MP3, WAV, M4A, etc.
                </p>
              </div>
            </label>

            {/* Show uploaded file info separately */}
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
                      onClick={handleTryAnother}
                      className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            )}

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
                    onClick={handleTryAnother}
                    className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}

            {/* Feature Info */}
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

            {/* Feature Visualizations - show skeleton while predicting, actual viz when ready */}
            {isPredicting && !displayResult && (
              <div className="mt-6 space-y-6">
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </div>
            )}

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
        </div>

        {/* Debug Info (only show if result exists) */}
        {displayResult && (
          <div 
            className={`
              mt-6 bg-gray-800/30 p-4 rounded-lg border border-gray-700
              transition-all duration-200 ease-out
              ${showResults ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}
            `}
          >
            <details>
              <summary className="cursor-pointer text-sm text-gray-400 hover:text-gray-300">
                Debug: View Extracted Features
              </summary>
              <div className="mt-3 text-xs text-gray-500 font-mono max-h-40 overflow-y-auto">
                {displayResult.features.map((val, idx) => (
                  <div key={idx}>Feature {idx}: {val.toFixed(4)}</div>
                ))}
              </div>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
