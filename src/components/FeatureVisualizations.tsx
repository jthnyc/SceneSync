import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { FeatureTimeSeries, HOP_SIZE } from '../utils/featureExtraction';
import type { FeatureVector } from '../workers/featureExtraction.types';

interface FeatureVisualizationsProps {
  // New props for active track system
  features?: FeatureVector;
  referenceFeatures?: FeatureVector | null;
  showComparison?: boolean;
  // Legacy props (keep for backward compatibility)
  timeSeries?: FeatureTimeSeries;
  sceneType?: string;
}

function computeRmsStats(rms: number[]) {
  const min = rms.reduce((a, b) => Math.min(a, b), Infinity);
  const max = rms.reduce((a, b) => Math.max(a, b), -Infinity);
  const mean = rms.reduce((a, b) => a + b, 0) / rms.length;
  const variance = rms.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / rms.length;
  const std = Math.sqrt(variance);
  const consistency = std < 0.03 ? 'High' : std < 0.06 ? 'Medium' : 'Low';
  return { min, max, range: max - min, consistency };
}

// Reduces a dense frame array to ~targetPoints points by averaging
function movingAverage(values: number[], targetPoints = 500): number[] {
  if (values.length <= targetPoints) return values;
  const windowSize = Math.ceil(values.length / targetPoints);
  const result: number[] = [];
  for (let i = 0; i < values.length; i += windowSize) {
    const window = values.slice(i, i + windowSize);
    result.push(window.reduce((a, b) => a + b, 0) / window.length);
  }
  return result;
}

// Convert percentile array to time series-like data for visualization
function percentileToSeries(feature: number[], label: string) {
  // Percentiles are [p25, p50, p75] - create a simple 3-point series
  return [
    { name: 'Lower', value: feature[0] },
    { name: 'Median', value: feature[1] },
    { name: 'Upper', value: feature[2] }
  ];
}

// Shared chart margin
const CHART_MARGIN = { top: 5, right: 5, bottom: 20, left: 0 };
const tooltipStyle = {
  contentStyle: { backgroundColor: '#1F2937', border: '1px solid #374151' },
  labelStyle: { color: '#9CA3AF' },
};
const xAxisProps = {
  stroke: '#9CA3AF',
  tickCount: 5,
  label: {
    value: 'Distribution',
    position: 'insideBottom' as const,
    offset: -5,
    fill: '#9CA3AF',
  },
};

export const FeatureVisualizations: React.FC<FeatureVisualizationsProps> = ({ 
  features,
  referenceFeatures,
  showComparison,
  timeSeries,
  sceneType = 'this track'
}) => {
  // If we have timeSeries (legacy mode), use that
  if (timeSeries) {
    const sampleRate = timeSeries.sampleRate ?? 44100;

    const frameToSeconds = (frameIndex: number) =>
      parseFloat(((frameIndex * HOP_SIZE) / sampleRate).toFixed(1));

    const smoothedRms = movingAverage(timeSeries.rms);
    const smoothedCentroid = movingAverage(timeSeries.spectralCentroid);
    const smoothedRolloff = movingAverage(timeSeries.spectralRolloff);

    const spectralLength = Math.min(smoothedCentroid.length, smoothedRolloff.length);

    const intensityData = smoothedRms.map((value, index) => ({
      seconds: frameToSeconds(index * Math.ceil(timeSeries.rms.length / smoothedRms.length)),
      intensity: value * 100,
    }));

    const spectralData = Array.from({ length: spectralLength }, (_, index) => ({
      seconds: frameToSeconds(index * Math.ceil(timeSeries.spectralCentroid.length / spectralLength)),
      centroid: smoothedCentroid[index],
      rolloff: smoothedRolloff[index],
    }));

    const rmsStats = computeRmsStats(timeSeries.rms);

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

        {/* Spectral Brightness */}
        <div className="bg-gray-800/50 p-4 rounded-lg">
          <h4 className="text-sm font-medium text-gray-300 mb-3">Spectral Brightness Over Time</h4>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={spectralData} margin={CHART_MARGIN}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis 
                dataKey="seconds" 
                stroke="#9CA3AF" 
                tickCount={5}
                label={{ value: 'Time (seconds)', position: 'insideBottom', offset: -5, fill: '#9CA3AF' }}
              />
              <YAxis stroke="#9CA3AF" width={40} />
              <Tooltip {...tooltipStyle} />
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
            Shows the tonal character of the music. Higher values indicate bright, airy sounds.
          </p>
        </div>

        {/* Dynamic Range */}
        <div className="bg-gray-800/50 p-4 rounded-lg">
          <h4 className="text-sm font-medium text-gray-300 mb-3">Dynamic Range</h4>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={intensityData} margin={CHART_MARGIN}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis 
                dataKey="seconds" 
                stroke="#9CA3AF" 
                tickCount={5}
                label={{ value: 'Time (seconds)', position: 'insideBottom', offset: -5, fill: '#9CA3AF' }}
              />
              <YAxis stroke="#9CA3AF" width={40} />
              <Tooltip {...tooltipStyle} />
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
              <div className="text-xs text-gray-400">Range</div>
              <div className="text-lg font-bold text-primary-400">
                {rmsStats.range.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-400">Consistency</div>
              <div className="text-lg font-bold text-primary-400">
                {rmsStats.consistency}
              </div>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Shows variation between quiet and loud moments.
          </p>
        </div>

        {/* Tempo */}
        <div className="bg-gray-800/50 p-4 rounded-lg">
          <h4 className="text-sm font-medium text-gray-300 mb-2">Tempo Analysis</h4>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-primary-400">{timeSeries.tempo.toFixed(0)}</span>
            <span className="text-gray-400">BPM</span>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Detected beats per minute.
          </p>
        </div>
      </div>
    );
  }

  // New mode: display feature vector as percentile distribution
  if (!features) return null;

  const title = showComparison && referenceFeatures 
    ? 'How this match compares to your reference'
    : 'Acoustic fingerprint analysis';

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-3 text-gray-300">
          {title}
        </h3>
        <p className="text-sm text-gray-400 mb-4">
          These values show the distribution of key audio characteristics.
          {showComparison && ' Blue bars show your reference, orange shows this match.'}
        </p>
      </div>

      {/* RMS (Energy) */}
      <div className="bg-gray-800/50 p-4 rounded-lg">
        <h4 className="text-sm font-medium text-gray-300 mb-3">Energy (RMS)</h4>
        <ResponsiveContainer width="100%" height={150}>
          <LineChart data={percentileToSeries(features.rms, 'Energy')} margin={CHART_MARGIN}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="name" stroke="#9CA3AF" />
            <YAxis stroke="#9CA3AF" width={40} />
            <Tooltip {...tooltipStyle} />
            <Line
              type="monotone"
              dataKey="value"
              stroke={showComparison ? "#F59E0B" : "#8B5CF6"}
              strokeWidth={2}
              dot={{ r: 4 }}
              name={showComparison ? "This match" : "Energy"}
            />
            {showComparison && referenceFeatures && (
              <Line
                type="monotone"
                dataKey={() => percentileToSeries(referenceFeatures.rms, 'Reference').map(d => d.value)}
                stroke="#3B82F6"
                strokeWidth={2}
                dot={{ r: 4 }}
                name="Your reference"
                data={percentileToSeries(referenceFeatures.rms, 'Reference')}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
        <p className="text-xs text-gray-500 mt-2">
          Lower, median, and upper quartile of loudness. Higher values = more intense.
        </p>
      </div>

      {/* Brightness (Centroid) */}
      <div className="bg-gray-800/50 p-4 rounded-lg">
        <h4 className="text-sm font-medium text-gray-300 mb-3">Brightness (Spectral Centroid)</h4>
        <ResponsiveContainer width="100%" height={150}>
          <LineChart data={percentileToSeries(features.centroid, 'Brightness')} margin={CHART_MARGIN}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="name" stroke="#9CA3AF" />
            <YAxis stroke="#9CA3AF" width={40} />
            <Tooltip {...tooltipStyle} />
            <Line
              type="monotone"
              dataKey="value"
              stroke={showComparison ? "#F59E0B" : "#F59E0B"}
              strokeWidth={2}
              dot={{ r: 4 }}
              name={showComparison ? "This match" : "Brightness"}
            />
            {showComparison && referenceFeatures && (
              <Line
                type="monotone"
                dataKey={() => percentileToSeries(referenceFeatures.centroid, 'Reference').map(d => d.value)}
                stroke="#3B82F6"
                strokeWidth={2}
                dot={{ r: 4 }}
                name="Your reference"
                data={percentileToSeries(referenceFeatures.centroid, 'Reference')}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
        <p className="text-xs text-gray-500 mt-2">
          Higher values = brighter, treble-heavy sound. Lower = darker, bass-heavy.
        </p>
      </div>

      {/* Tonal vs Noisy (Flatness) */}
      <div className="bg-gray-800/50 p-4 rounded-lg">
        <h4 className="text-sm font-medium text-gray-300 mb-3">Texture (Spectral Flatness)</h4>
        <ResponsiveContainer width="100%" height={150}>
          <LineChart data={percentileToSeries(features.flatness, 'Flatness')} margin={CHART_MARGIN}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="name" stroke="#9CA3AF" />
            <YAxis stroke="#9CA3AF" width={40} />
            <Tooltip {...tooltipStyle} />
            <Line
              type="monotone"
              dataKey="value"
              stroke={showComparison ? "#F59E0B" : "#10B981"}
              strokeWidth={2}
              dot={{ r: 4 }}
              name={showComparison ? "This match" : "Texture"}
            />
            {showComparison && referenceFeatures && (
              <Line
                type="monotone"
                dataKey={() => percentileToSeries(referenceFeatures.flatness, 'Reference').map(d => d.value)}
                stroke="#3B82F6"
                strokeWidth={2}
                dot={{ r: 4 }}
                name="Your reference"
                data={percentileToSeries(referenceFeatures.flatness, 'Reference')}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
        <p className="text-xs text-gray-500 mt-2">
          Lower values = more tonal (clear pitch). Higher = more noisy/textural.
        </p>
      </div>

      {/* Summary */}
      <div className="bg-gray-800/30 p-4 rounded-lg border border-gray-700">
        <p className="text-sm text-gray-300">
          {showComparison 
            ? "These three dimensions — energy, brightness, and texture — are the primary drivers of musical emotion. The closer these profiles match your reference, the more similar the emotional impact."
            : "Your reference track's acoustic fingerprint. These three dimensions — energy, brightness, and texture — define its emotional character."}
        </p>
      </div>
    </div>
  );
};