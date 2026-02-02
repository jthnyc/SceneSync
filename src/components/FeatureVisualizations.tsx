import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { FeatureTimeSeries } from '../utils/featureExtraction';

interface FeatureVisualizationsProps {
  timeSeries: FeatureTimeSeries;
  sceneType: string;
}

export const FeatureVisualizations: React.FC<FeatureVisualizationsProps> = ({ timeSeries, sceneType }) => {
  // Convert arrays to chart data format
  const intensityData = timeSeries.rms.map((value, index) => ({
    frame: index,
    intensity: value * 100, // Scale for better visualization
  }));

  const spectralData = timeSeries.spectralCentroid.map((value, index) => ({
    frame: index,
    centroid: value,
    rolloff: timeSeries.spectralRolloff[index]
  }));

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-3 text-gray-300">
          Why this music fits <span className="text-primary-400">{sceneType}</span>
        </h3>
        <p className="text-sm text-gray-400 mb-4">
          These graphs show key audio characteristics that influenced the classification.
        </p>
      </div>

      {/* Spectral Brightness Over Time */}
      <div className="bg-gray-800/50 p-4 rounded-lg">
        <h4 className="text-sm font-medium text-gray-300 mb-3">Spectral Brightness Over Time</h4>
        <ResponsiveContainer width="100%" height={200}>
            <LineChart data={spectralData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis 
                dataKey="frame" 
                stroke="#9CA3AF"
                label={{ value: 'Time (frames)', position: 'insideBottom', offset: -5, fill: '#9CA3AF' }}
            />
            <YAxis stroke="#9CA3AF" />
            <Tooltip 
                contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151' }}
                labelStyle={{ color: '#9CA3AF' }}
            />
            <Line 
                type="monotone" 
                dataKey="centroid" 
                stroke="#F59E0B" 
                strokeWidth={2}
                dot={false}
                name="Brightness"
            />
            </LineChart>
        </ResponsiveContainer>
        <p className="text-xs text-gray-500 mt-2">
            Shows the tonal character of the music. Higher values indicate bright, airy sounds (strings, cymbals). Lower values indicate dark, heavy timbres (bass, drums, cello).
        </p>
      </div>

      {/* Dynamic Range */}
      <div className="bg-gray-800/50 p-4 rounded-lg">
        <h4 className="text-sm font-medium text-gray-300 mb-3">Dynamic Range</h4>
        <ResponsiveContainer width="100%" height={200}>
            <LineChart data={intensityData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis 
                dataKey="frame" 
                stroke="#9CA3AF"
                label={{ value: 'Time (frames)', position: 'insideBottom', offset: -5, fill: '#9CA3AF' }}
            />
            <YAxis stroke="#9CA3AF" />
            <Tooltip 
                contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151' }}
                labelStyle={{ color: '#9CA3AF' }}
            />
            <Line 
                type="monotone" 
                dataKey="intensity" 
                stroke="#8B5CF6" 
                strokeWidth={2}
                dot={false}
                name="Volume Variation"
            />
            </LineChart>
        </ResponsiveContainer>
        <div className="flex items-center justify-between mt-3">
            <div>
                <div className="text-xs text-gray-400">Range:</div>
                    <div className="text-lg font-bold text-primary-400">
                        {(Math.max(...timeSeries.rms) - Math.min(...timeSeries.rms)).toFixed(2)}
                    </div>
                </div>
                <div>
                    <div className="text-xs text-gray-400">Consistency:</div>
                        <div className="text-lg font-bold text-primary-400">
                            {(() => {
                            const std = Math.sqrt(
                                timeSeries.rms.reduce((sum, val) => {
                                const mean = timeSeries.rms.reduce((a, b) => a + b) / timeSeries.rms.length;
                                return sum + Math.pow(val - mean, 2);
                                }, 0) / timeSeries.rms.length
                            );
                            return std < 0.03 ? 'High' : std < 0.06 ? 'Medium' : 'Low';
                            })()}
                        </div>
                </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">
                Shows variation between quiet and loud moments. High range indicates dramatic shifts, low range suggests consistent levels throughout.
            </p>
        </div>

        {/* Tempo Display */}
        <div className="bg-gray-800/50 p-4 rounded-lg">
            <h4 className="text-sm font-medium text-gray-300 mb-2">Tempo Analysis</h4>
            <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-primary-400">{timeSeries.tempo.toFixed(0)}</span>
            <span className="text-gray-400">BPM</span>
            </div>
            <p className="text-xs text-gray-500 mt-2">
            Detected beats per minute. Helps determine if the music feels slow, moderate, or fast-paced.
            </p>
        </div>
    </div>
  );
};