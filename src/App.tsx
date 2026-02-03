import React, { useEffect, useState, useRef } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { useScenePrediction, PredictionResult } from './hooks/useScenePrediction';
import Header from './components/Header';
import ModelStatus from './components/ModelStatus';
import Sidebar from './components/Sidebar';
import MainContent from './components/MainContent';
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
  const [trackHistory, setTrackHistory] = useState<TrackHistory[]>([]);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);
  const lastToastResultRef = useRef<PredictionResult | null>(null);

  const displayResult: PredictionResult | undefined = selectedTrackId 
    ? trackHistory.find(t => t.id === selectedTrackId)?.result ?? undefined
    : result ?? undefined;

  // Trigger fade-in animation when displayResult changes
  useEffect(() => {
    if (displayResult) {
      setShowResults(false);
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

  // Show error toast when error occurs
  useEffect(() => {
    if (error) {
      toast.error('Failed to load model. Please try again.', {
        duration: 4000,
      });
    }
  }, [error]);

  // Add track to history when result updates
  useEffect(() => {
    if (result && selectedFile) {
      const newTrack: TrackHistory = {
        id: Date.now().toString(),
        fileName: selectedFile.name,
        timestamp: Date.now(),
        result: result
      };
      
      setTrackHistory(prev => {
        if (prev.length > 0 && prev[0].result === result) {
          return prev;
        }
        return [newTrack, ...prev];
      });
      
      // Show toast only once per result
      if (lastToastResultRef.current !== result) {
        lastToastResultRef.current = result;
        toast.success('Analysis complete!', {
          duration: 3000,
        });
      }
      
      setSelectedTrackId(newTrack.id);
    }
  }, [result, selectedFile]);

  // Save to localStorage whenever history changes
  useEffect(() => {
    localStorage.setItem('sceneSync_trackHistory', JSON.stringify(trackHistory));
  }, [trackHistory]);

  // File upload handler
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const existingTrack = trackHistory.find(
      track => track.fileName === file.name && track.result
    );

    if (existingTrack) {
      setSelectedTrackId(existingTrack.id);
      setSelectedFile(null);
      toast('Track already analyzed! Showing previous results.', {
        icon: '📊',
        duration: 3000,
      });
      return;
    }

    setSelectedFile(file);
    setSelectedTrackId(null);
    await predictSceneType(file);
  };

  // Drag and drop handler
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('audio/')) {
      const existingTrack = trackHistory.find(
        track => track.fileName === file.name && track.result
      );

      if (existingTrack) {
        setSelectedTrackId(existingTrack.id);
        setSelectedFile(null);
        toast('Track already analyzed! Showing previous results.', {
          icon: '📊',
          duration: 3000,
        });
        return;
      }

      setSelectedFile(file);
      setSelectedTrackId(null);
      await predictSceneType(file);
    }
  };

  // Clear file handler
  const handleClearFile = () => {
    setSelectedFile(null);
    setSelectedTrackId(null);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
  };

  // Track selection handler
  const handleSelectTrack = (id: string) => {
    setSelectedTrackId(id);
    setSelectedFile(null);
  };

  // Remove track handler
  const removeTrack = (id: string) => {
    setTrackHistory(prev => prev.filter(t => t.id !== id));
    if (selectedTrackId === id) {
      setSelectedTrackId(null);
      setSelectedFile(null);
    }
    toast.success('Track removed', {
      duration: 2000,
    });
  };

  // Clear all tracks handler
  const clearAllTracks = () => {
    const count = trackHistory.length;
    setTrackHistory([]);
    setSelectedTrackId(null);
    setSelectedFile(null);
    toast.success(`Cleared ${count} track${count !== 1 ? 's' : ''}`, {
      duration: 2000,
    });
  };

  // Retry model initialization
  const handleRetryModelInit = async () => {
    await initializeModel();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-black text-white p-8">
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: '#1f2937',
            color: '#fff',
            border: '1px solid #374151',
          },
          success: {
            iconTheme: {
              primary: '#10b981',
              secondary: '#fff',
            },
          },
        }}
      />
      <div className="max-w-6xl mx-auto">
        <Header />
        
        <ModelStatus
          isLoading={isLoading}
          isModelLoaded={isModelLoaded}
          error={error}
          onRetry={handleRetryModelInit}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Sidebar
            displayResult={displayResult}
            isPredicting={isPredicting}
            trackHistory={trackHistory}
            selectedTrackId={selectedTrackId}
            sceneDescriptions={sceneDescriptions}
            showResults={showResults}
            onSelectTrack={handleSelectTrack}
            onRemoveTrack={removeTrack}
            onClearAll={clearAllTracks}
          />

          <MainContent
            selectedFile={selectedFile}
            selectedTrackId={selectedTrackId}
            trackHistory={trackHistory}
            displayResult={displayResult}
            isPredicting={isPredicting}
            isLoading={isLoading}
            hasError={error !== null && !isModelLoaded}
            showResults={showResults}
            onFileChange={handleFileChange}
            onFileDrop={handleDrop}
            onClearFile={handleClearFile}
          />
        </div>

        {/* Debug Info */}
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
