import React, { useEffect, useState } from 'react';
import { Upload, Brain, CheckCircle, AlertCircle } from 'lucide-react';
import { useScenePrediction, PredictionResult } from './hooks/useScenePrediction';
import { FeatureVisualizations } from './components/FeatureVisualizations';
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

  const displayResult = selectedTrackId ? trackHistory.find(t => t.id === selectedTrackId)?.result : result;

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

    setSelectedFile(file);
    setSelectedTrackId(null); // Reset selection
    await predictSceneType(file);
  };

  const handleTryAnother = () => {
    setSelectedFile(null);
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
      setSelectedFile(file);
      await predictSceneType(file);
    }
  };

  const removeTrack = (id: string) => {
    setTrackHistory(prev => prev.filter(t => t.id !== id));
    if (selectedTrackId === id) {
      setSelectedTrackId(null);
    }
  };

  const clearAllTracks = () => {
    setTrackHistory([]);
    setSelectedTrackId(null);
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
            <div className="flex items-center gap-2 text-yellow-400">
              <Brain className="animate-pulse" />
              <span>Loading ML model...</span>
            </div>
          )}
          {isModelLoaded && !isLoading && (
            <div className="flex items-center gap-2 text-green-400">
              <CheckCircle size={20} />
              <span>Model ready</span>
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 text-red-400">
              <AlertCircle size={20} />
              <span>{error}</span>
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
              <div className="flex items-center gap-2 text-yellow-400">
                <Brain className="animate-pulse" size={20} />
                <span>Analyzing audio...</span>
              </div>
            )}

            {displayResult && (
              <div className="space-y-4 mb-6">
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
                            className="bg-primary-500 h-2 rounded-full transition-all"
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
                    className="text-xs text-red-400 hover:text-red-300"
                  >
                    Clear All
                  </button>
                </div>
                
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {trackHistory.map((track) => (
                    <div
                      key={track.id}
                      className={`
                        p-3 rounded-lg cursor-pointer transition-colors
                        ${selectedTrackId === track.id ? 'bg-primary-500/20 border border-primary-500' : 'bg-gray-700/30 hover:bg-gray-700/50'}
                      `}
                      onClick={() => {
                        setSelectedTrackId(track.id);
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
                  disabled={isPredicting || isLoading}
                  className="hidden"
                />
                <Upload className="mx-auto mb-4 text-gray-400" size={48} />
                <p className="text-lg mb-2">
                  Drop audio file here or click to browse
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
                      { selectedTrackId ? trackHistory.find(t => t.id === selectedTrackId)?.fileName : selectedFile.name }
                    </div>
                  </div>
                  {!isPredicting && (
                    <button
                      onClick={handleTryAnother}
                      className="text-sm text-blue-400 hover:text-blue-300"
                    >
                      Clear
                    </button>
                  )}
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

            {/* Feature Visualizations - show when result exists */}
            {displayResult && (
              <div className="mt-6">
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
          <div className="mt-6 bg-gray-800/30 p-4 rounded-lg border border-gray-700">
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