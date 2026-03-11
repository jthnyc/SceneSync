import React from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { FeatureVector } from '../workers/featureExtraction.types';

interface FeatureVisualizationsProps {
  features?: FeatureVector;
  referenceFeatures?: FeatureVector | null;
  showComparison?: boolean;
}

const CHROMA_LABELS = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

function buildChromaData(
  active: FeatureVector,
  reference?: FeatureVector | null
): { note: string; active: number; reference?: number }[] {
  return CHROMA_LABELS.map((note, i) => {
    const key = `chroma_${i + 1}` as keyof FeatureVector;
    const activeVal = (active[key] as [number, number, number])[1]; // p50
    const refVal = reference
      ? (reference[key] as [number, number, number])[1]
      : undefined;
    return { note, active: activeVal, ...(refVal != null ? { reference: refVal } : {}) };
  });
}

// Merges active + optional reference percentile arrays into recharts-ready data
function buildChartData(
  active: number[],
  reference?: number[] | null
): { name: string; active: number; reference?: number }[] {
  const labels = ['Lower', 'Median', 'Upper'];
  return labels.map((name, i) => ({
    name,
    active: active[i],
    ...(reference != null ? { reference: reference[i] } : {}),
  }));
}

const CHART_MARGIN = { top: 5, right: 10, bottom: 20, left: 0 };

const tooltipStyle = {
  contentStyle: { backgroundColor: '#1F2937', border: '1px solid #374151' },
  labelStyle: { color: '#9CA3AF' },
};

interface ArcChartProps {
  data: { name: string; active: number; reference?: number }[];
  showComparison: boolean;
  activeColor: string;
}

const ArcChart: React.FC<ArcChartProps> = ({ data, showComparison, activeColor }) => (
  <ResponsiveContainer width="100%" height={150}>
    <LineChart data={data} margin={CHART_MARGIN}>
      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
      <XAxis dataKey="name" stroke="#9CA3AF" tick={{ fontSize: 12 }} />
      <YAxis stroke="#9CA3AF" width={45} tick={{ fontSize: 11 }} />
      <Tooltip {...tooltipStyle} />
      {showComparison && <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />}
      <Line
        type="monotone"
        dataKey="active"
        stroke={showComparison ? '#F59E0B' : activeColor}
        strokeWidth={2}
        dot={{ r: 4 }}
        name={showComparison ? 'This match' : 'Value'}
        activeDot={{ r: 5 }}
      />
      {showComparison && data[0]?.reference != null && (
        <Line
          type="monotone"
          dataKey="reference"
          stroke="#3B82F6"
          strokeWidth={2}
          dot={{ r: 4 }}
          name="Your reference"
          activeDot={{ r: 5 }}
          strokeDasharray="5 5"
        />
      )}
    </LineChart>
  </ResponsiveContainer>
);

export const FeatureVisualizations: React.FC<FeatureVisualizationsProps> = ({
  features,
  referenceFeatures,
  showComparison = false,
}) => {
  if (!features) return null;

  const ref = showComparison ? referenceFeatures : null;

  const title = showComparison && referenceFeatures
    ? 'How this match compares to your reference'
    : 'Acoustic fingerprint';

  const subtitle = showComparison
    ? 'Orange = this match · Blue dashed = your reference · Each chart shows lower quartile → median → upper quartile'
    : 'Lower quartile → median → upper quartile of each characteristic across the track.';

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-1 text-gray-300">{title}</h3>
        <p className="text-sm text-gray-400">{subtitle}</p>
      </div>

      {/* Harmonic Content (Chroma) */}
      <div className="bg-gray-800/50 p-4 rounded-lg">
        <h4 className="text-sm font-medium text-gray-300 mb-3">
          Harmonic Content (Chroma)
        </h4>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart
            data={buildChromaData(features, ref)}
            margin={{ top: 5, right: 10, bottom: 5, left: 0 }}
            barCategoryGap="20%"
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
            <XAxis
              dataKey="note"
              stroke="#9CA3AF"
              tick={{ fontSize: 11 }}
            />
            <YAxis stroke="#9CA3AF" width={35} tick={{ fontSize: 11 }} />
            <Tooltip {...tooltipStyle} />
            {showComparison && referenceFeatures && (
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
            )}
            <Bar
              dataKey="active"
              fill={showComparison ? '#F59E0B' : '#6366F1'}
              name={showComparison ? 'This match' : 'Energy'}
              radius={[2, 2, 0, 0]}
            />
            {showComparison && referenceFeatures && (
              <Bar
                dataKey="reference"
                fill="#3B82F6"
                name="Your reference"
                radius={[2, 2, 0, 0]}
              />
            )}
          </BarChart>
        </ResponsiveContainer>
        <p className="text-xs text-gray-500 mt-2">
          Which pitch classes are most present. Peaks show the harmonic center of the track.
        </p>
      </div>

      {/* Energy (RMS) */}
      <div className="bg-gray-800/50 p-4 rounded-lg">
        <h4 className="text-sm font-medium text-gray-300 mb-3">Energy (RMS)</h4>
        <ArcChart
          data={buildChartData(features.rms, ref?.rms)}
          showComparison={showComparison && !!referenceFeatures}
          activeColor="#8B5CF6"
        />
        <p className="text-xs text-gray-500 mt-2">
          How loud and intense the track is. Higher = more powerful.
        </p>
      </div>

      {/* Brightness (Spectral Centroid) */}
      <div className="bg-gray-800/50 p-4 rounded-lg">
        <h4 className="text-sm font-medium text-gray-300 mb-3">Brightness (Spectral Centroid)</h4>
        <ArcChart
          data={buildChartData(features.centroid, ref?.centroid)}
          showComparison={showComparison && !!referenceFeatures}
          activeColor="#F59E0B"
        />
        <p className="text-xs text-gray-500 mt-2">
          Higher = brighter, treble-heavy. Lower = darker, bass-heavy.
        </p>
      </div>

      {/* Texture (Flatness) */}
      <div className="bg-gray-800/50 p-4 rounded-lg">
        <h4 className="text-sm font-medium text-gray-300 mb-3">Texture (Spectral Flatness)</h4>
        <ArcChart
          data={buildChartData(features.flatness, ref?.flatness)}
          showComparison={showComparison && !!referenceFeatures}
          activeColor="#10B981"
        />
        <p className="text-xs text-gray-500 mt-2">
          Lower = more tonal, clear pitch. Higher = noisier, more textural.
        </p>
      </div>

      {/* Spectral Spread */}
      <div className="bg-gray-800/50 p-4 rounded-lg">
        <h4 className="text-sm font-medium text-gray-300 mb-3">Frequency Width (Spectral Spread)</h4>
        <ArcChart
          data={buildChartData(features.spread, ref?.spread)}
          showComparison={showComparison && !!referenceFeatures}
          activeColor="#EC4899"
        />
        <p className="text-xs text-gray-500 mt-2">
          How wide the frequency range is. Higher = fuller sound. Lower = more focused or sparse.
        </p>
      </div>

      {/* Summary callout */}
      <div className="bg-gray-800/30 p-4 rounded-lg border border-gray-700">
        <p className="text-sm text-gray-300">
          {showComparison
            ? 'The closer these arcs follow the same shape, the more similar the emotional weight of the two tracks.'
            : 'These four dimensions — energy, brightness, texture, and frequency width — define the emotional character of your reference.'}
        </p>
      </div>
    </div>
  );
};