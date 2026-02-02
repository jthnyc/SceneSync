import React, { useEffect, useState } from 'react';
import { Upload, Brain, CheckCircle, AlertCircle } from 'lucide-react';
import { useScenePrediction } from './hooks/useScenePrediction';
import './index.css';

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

  // Initialize model on mount
  useEffect(() => {
    initializeModel();
  }, [initializeModel]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    await predictSceneType(file);
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
          
          {/* Sidebar - Results */}
          <div className="lg:col-span-1 bg-gray-800/50 p-6 rounded-xl border border-gray-700">
            <h2 className="text-xl font-semibold mb-4 text-primary-400">Prediction Results</h2>
            
            {!result && !isPredicting && (
              <p className="text-gray-500 text-sm">Upload an audio file to see results</p>
            )}

            {isPredicting && (
              <div className="flex items-center gap-2 text-yellow-400">
                <Brain className="animate-pulse" size={20} />
                <span>Analyzing audio...</span>
              </div>
            )}

            {result && (
              <div className="space-y-4">
                <div className="bg-gray-700/50 p-4 rounded-lg">
                  <div className="text-sm text-gray-400 mb-1">Scene Type</div>
                  <div className="text-2xl font-bold text-primary-400">
                    {result.sceneType}
                  </div>
                  <div className="text-sm text-gray-300 mt-1">
                    {(result.confidence * 100).toFixed(1)}% confidence
                  </div>
                </div>

                <div>
                  <div className="text-sm text-gray-400 mb-2">All Probabilities</div>
                  {Object.entries(result.probabilities)
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
                  Processing time: {(result.processingTime / 1000).toFixed(1)}s
                </div>
              </div>
            )}
          </div>

          {/* Main Content - Upload Zone */}
          <div className="lg:col-span-2 bg-gray-800/50 p-6 rounded-xl border border-gray-700">
            <h2 className="text-xl font-semibold mb-4 text-primary-400">Upload Audio</h2>
            
            <label className="block">
              <div className={`
                border-2 border-dashed rounded-lg p-12 text-center cursor-pointer
                transition-all hover:border-primary-500 hover:bg-gray-800/30
                ${isPredicting ? 'border-yellow-500 bg-yellow-500/10' : 'border-gray-600'}
              `}>
                <input
                  type="file"
                  accept="audio/*"
                  onChange={handleFileChange}
                  disabled={isPredicting || isLoading}
                  className="hidden"
                />
                <Upload className="mx-auto mb-4 text-gray-400" size={48} />
                <p className="text-lg mb-2">
                  {selectedFile ? selectedFile.name : 'Drop audio file here or click to browse'}
                </p>
                <p className="text-sm text-gray-500">
                  Supports: MP3, WAV, M4A, etc.
                </p>
              </div>
            </label>

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

            {/* How it works */}
            <div className="mt-6 bg-gray-700/20 p-4 rounded-lg">
              <h3 className="font-semibold text-sm mb-2 text-gray-300">How it works</h3>
              <ol className="text-sm text-gray-400 space-y-1 list-decimal list-inside">
                <li>Upload your film music track (30 seconds analyzed)</li>
                <li>Extract 44 audio features (MFCCs, spectral, energy, etc.)</li>
                <li>Neural network predicts the best scene type match</li>
                <li>Get instant results with confidence scores</li>
              </ol>
            </div>
          </div>
        </div>

        {/* Debug Info (only show if result exists) */}
        {result && (
          <div className="mt-6 bg-gray-800/30 p-4 rounded-lg border border-gray-700">
            <details>
              <summary className="cursor-pointer text-sm text-gray-400 hover:text-gray-300">
                Debug: View Extracted Features
              </summary>
              <div className="mt-3 text-xs text-gray-500 font-mono max-h-40 overflow-y-auto">
                {result.features.map((val, idx) => (
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