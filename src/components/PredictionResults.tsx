import React from 'react';
import { PredictionResult } from '../hooks/useScenePrediction';

interface PredictionResultsProps {
  result: PredictionResult;
  sceneDescriptions: { [key: string]: string };
  showResults: boolean;
}

const PredictionResults: React.FC<PredictionResultsProps> = ({ 
  result, 
  sceneDescriptions,
  showResults 
}) => {
  return (
    <div 
      className={`
        space-y-4 mb-6 transition-all duration-200 ease-out
        ${showResults ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}
      `}
    >
      {/* Scene Type Card */}
      <div className="bg-gray-700/50 p-4 rounded-lg">
        <div className="text-sm text-gray-400 mb-1">Scene Type</div>
        <div className="text-2xl font-bold text-primary-400">
          {result.sceneType}
        </div>
        <p className="text-sm text-gray-300 mt-2 leading-relaxed">
          {sceneDescriptions[result.sceneType] || ""}
        </p>
        <div className="text-sm text-gray-400 mt-3">
          {(result.confidence * 100).toFixed(1)}% confidence
        </div>
      </div>

      {/* All Probabilities */}
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
                  className="bg-primary-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${prob * 100}%` }}
                />
              </div>
            </div>
          ))}
      </div>

      {/* Processing Time */}
      <div className="text-xs text-gray-500 pt-2 border-t border-gray-700">
        Processing time: {(result.processingTime / 1000).toFixed(1)}s
      </div>
    </div>
  );
};

export default PredictionResults;
