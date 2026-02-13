import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { FeatureTimeSeries, HOP_SIZE } from '../utils/featureExtraction';

interface FeatureVisualizationsProps {
  timeSeries: FeatureTimeSeries;
  sceneType: string;
}

// FIX 3 & 4: Compute RMS stats once, outside render, with reduce instead of spread.
// Math.max(...largeArray) risks "Maximum call stack exceeded" for 2700+ element arrays.
// The Consistency reduce was also recalculating mean on every iteration — O(n²).
function computeRmsStats(rms: number[]) {
  const min = rms.reduce((a, b) => Math.min(a, b), Infinity);
  const max = rms.reduce((a, b) => Math.max(a, b), -Infinity);
  const mean = rms.reduce((a, b) => a + b, 0) / rms.length;
  const variance = rms.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / rms.length;
  const std = Math.sqrt(variance);
  const consistency = std < 0.03 ? 'High' : std < 0.06 ? 'Medium' : 'Low';
  return { min, max, range: max - min, consistency };
}

// Shared chart margin — bottom: 20 gives the "Time (frames)" insideBottom label room
// to render without being clipped by the SVG boundary.
const CHART_MARGIN = { top: 5, right: 5, bottom: 20, left: 0 };

const tooltipStyle = {
  contentStyle: { backgroundColor: '#1F2937', border: '1px solid #374151' },
  labelStyle: { color: '#9CA3AF' },
};

export const FeatureVisualizations: React.FC<FeatureVisualizationsProps> = ({ timeSeries, sceneType }) => {
  const sampleRate = timeSeries.sampleRate ?? 44100;

  // Convert frame index → seconds using the same HOP_SIZE used during extraction.
  // seconds = frameIndex × HOP_SIZE / sampleRate
  // e.g. frame 551 at 44100 Hz: 551 × 512 / 44100 ≈ 6.4s
  const frameToSeconds = (frameIndex: number) =>
    parseFloat(((frameIndex * HOP_SIZE) / sampleRate).toFixed(1));

  const intensityData = timeSeries.rms.map((value, index) => ({
    seconds: frameToSeconds(index),
    intensity: value * 100,
  }));

  const spectralData = timeSeries.spectralCentroid.map((value, index) => ({
    seconds: frameToSeconds(index),
    centroid: value,
    rolloff: timeSeries.spectralRolloff[index],
  }));

  const rmsStats = computeRmsStats(timeSeries.rms);

  // Shared XAxis props — dataKey is now 'seconds', tickCount={5} prevents
  // crowding on narrow screens, tickFormatter appends 's' suffix.
  const xAxisProps = {
    dataKey: 'seconds' as const,
    stroke: '#9CA3AF',
    tickCount: 5,
    label: {
        value: 'Time (seconds)',
        position: 'insideBottom' as const,
        offset: -5,
        fill: '#9CA3AF',
    },
  };

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
          <LineChart data={spectralData} margin={CHART_MARGIN}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis {...xAxisProps} />
            <YAxis stroke="#9CA3AF" />
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
          Shows the tonal character of the music. Higher values indicate bright, airy sounds
          (strings, cymbals). Lower values indicate dark, heavy timbres (bass, drums, cello).
        </p>
      </div>

      {/* Dynamic Range */}
      <div className="bg-gray-800/50 p-4 rounded-lg">
        <h4 className="text-sm font-medium text-gray-300 mb-3">Dynamic Range</h4>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={intensityData} margin={CHART_MARGIN}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis {...xAxisProps} />
            <YAxis stroke="#9CA3AF" />
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
          Shows variation between quiet and loud moments. High range indicates dramatic shifts,
          low range suggests consistent levels throughout.
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