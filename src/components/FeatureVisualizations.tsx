import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import type { FeatureVector } from '../workers/featureExtraction.types';

// ── Props ─────────────────────────────────────────────────────────────────

interface FeatureVisualizationsProps {
  features?: FeatureVector;
  referenceFeatures?: FeatureVector | null;
  showComparison?: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────

const CHROMA_LABELS = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

// MFCC 1 excluded — correlates with loudness, dominates the Y-axis scale,
// and is already weighted to zero in similarity search. Coefficients 2–13
// carry the actual timbral/instrument character.
const MFCC_KEYS = Array.from({ length: 12 }, (_, i) => `mfcc_${i + 2}` as keyof FeatureVector);

const ACOUSTIC_DIMENSIONS = [
  { key: 'rms', label: 'Energy' },
  { key: 'centroid', label: 'Brightness' },
  { key: 'flatness', label: 'Texture' },
  { key: 'spread', label: 'Width' },
  { key: 'zcr', label: 'Activity' },
] as const;

// ── Tooltip styles ────────────────────────────────────────────────────────

const tooltipStyle = {
  contentStyle: { backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: 6 },
  labelStyle: { color: '#9CA3AF' },
};

// ── Chart 1: MFCC Timbral Profile (comparison mode only) ─────────────────
// Shows MFCC coefficients 2–13 at p50, reference vs match side by side.
// MFCC 1 is excluded (correlates with loudness, already zero-weighted).
// This is where instrument character and timbral "color" live — the most
// revealing comparison for understanding why two tracks sound different
// despite matching on energy/brightness.

function buildMfccData(
  active: FeatureVector,
  reference: FeatureVector
): { name: string; match: number; reference: number }[] {
  return MFCC_KEYS.map((key, i) => ({
    name: `${i + 2}`,
    match: (active[key] as [number, number, number])[1],
    reference: (reference[key] as [number, number, number])[1],
  }));
}

function buildMfccSrSummary(data: { name: string; match: number; reference: number }[]): string {
  const biggest = [...data].sort((a, b) =>
    Math.abs(b.match - b.reference) - Math.abs(a.match - a.reference)
  )[0];
  const direction = biggest.match > biggest.reference ? 'higher' : 'lower';
  return `Timbral profile comparing 12 MFCC coefficients. Largest divergence at coefficient ${biggest.name}, where the match is ${direction} than the reference.`;
}

interface MfccChartProps {
  data: { name: string; match: number; reference: number }[];
}

const MfccChart: React.FC<MfccChartProps> = ({ data }) => (
  <ResponsiveContainer width="100%" height={180}>
    <BarChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: 0 }} barCategoryGap="20%">
      <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
      <XAxis
        dataKey="name"
        stroke="#9CA3AF"
        tick={{ fontSize: 11 }}
        label={{ value: 'MFCC coefficient', position: 'insideBottom', offset: -2, style: { fill: '#6B7280', fontSize: 10 } }}
      />
      <YAxis stroke="#9CA3AF" width={45} tick={{ fontSize: 11 }} />
      <Tooltip {...tooltipStyle} formatter={(value: number | undefined) => value != null ? value.toFixed(2) : ''} />
      <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
      <Bar dataKey="match" fill="#F59E0B" name="This match" radius={[2, 2, 0, 0]} />
      <Bar dataKey="reference" fill="#3B82F6" name="Your reference" radius={[2, 2, 0, 0]} />
    </BarChart>
  </ResponsiveContainer>
);

// ── Chart 2: Harmonic Content (Chroma) ───────────────────────────────────
// Normalized to 0–1 per track so the Y-axis reads as "relative strength"
// (1 = most prominent pitch class in this track, 0 = absent).
//
// Per-track max normalization: divides each pitch class by the track's
// strongest chroma bin. Without this, raw magnitudes vary too much between
// tracks for the Y-axis to be meaningful in comparison mode.

function normalizeChroma(fv: FeatureVector): number[] {
  const raw = CHROMA_LABELS.map((_, i) => {
    const key = `chroma_${i + 1}` as keyof FeatureVector;
    return (fv[key] as [number, number, number])[1];
  });
  const max = Math.max(...raw);
  if (max === 0) return raw;
  return raw.map(v => v / max);
}

function buildChromaSrSummary(fv: FeatureVector): string {
  const norm = normalizeChroma(fv);
  const labeled = CHROMA_LABELS.map((note, i) => ({ note, val: norm[i] }));
  const top3 = [...labeled].sort((a, b) => b.val - a.val).slice(0, 3);
  return `Harmonic content across 12 pitch classes. Strongest: ${top3.map(t => `${t.note} (${(t.val * 100).toFixed(0)}%)`).join(', ')}.`;
}

function buildChromaData(
  active: FeatureVector,
  reference?: FeatureVector | null
): { note: string; active: number; reference?: number }[] {
  const activeNorm = normalizeChroma(active);
  const refNorm = reference ? normalizeChroma(reference) : null;

  return CHROMA_LABELS.map((note, i) => ({
    note,
    active: activeNorm[i],
    ...(refNorm ? { reference: refNorm[i] } : {}),
  }));
}

// ── Chart 3: Acoustic Properties ─────────────────────────────────────────
// Shows categorical labels for five core dimensions. In comparison mode,
// displays reference vs match side by side — matching labels get a subtle
// "same" treatment, divergent ones get highlighted. This avoids the
// normalization problems of trying to put different-scale values on one axis.

// Categorical labels for both modes
function getAcousticLabel(fv: FeatureVector, key: string): string {
  const val = (fv[key as keyof FeatureVector] as [number, number, number])[1];
  switch (key) {
    case 'rms':
      if (val < 0.02) return 'Quiet';
      if (val < 0.06) return 'Moderate';
      return 'Loud';
    case 'centroid':
      if (val > 80) return 'Bright';
      if (val > 50) return 'Balanced';
      if (val > 25) return 'Warm';
      return 'Dark';
    case 'flatness':
      if (val > 0.4) return 'Noisy';
      if (val > 0.15) return 'Mixed';
      return 'Tonal';
    case 'spread':
      if (val > 50) return 'Wide';
      if (val > 25) return 'Medium';
      return 'Narrow';
    case 'zcr':
      if (val > 0.15) return 'Busy';
      if (val > 0.05) return 'Moderate';
      return 'Calm';
    default:
      return '';
  }
}

const ACOUSTIC_COLORS: Record<string, string> = {
  Energy: '#8B5CF6',
  Brightness: '#F59E0B',
  Texture: '#10B981',
  Width: '#EC4899',
  Activity: '#06B6D4',
};

// ── Reference-only acoustic summary ──────────────────────────────────────

interface AcousticSummaryProps {
  features: FeatureVector;
}

const AcousticSummary: React.FC<AcousticSummaryProps> = ({ features }) => (
  <div className="grid grid-cols-5 gap-2" role="list" aria-label="Acoustic properties summary">
    {ACOUSTIC_DIMENSIONS.map(({ key, label }) => (
      <div key={key} className="text-center" role="listitem">
        <div
          className="w-3 h-3 rounded-full mx-auto mb-1.5"
          style={{ backgroundColor: ACOUSTIC_COLORS[label] }}
          aria-hidden="true"
        />
        <p className="text-xs font-medium text-gray-300">{label}</p>
        <p className="text-xs text-gray-400 mt-0.5">{getAcousticLabel(features, key)}</p>
      </div>
    ))}
  </div>
);

// ── Comparison table ─────────────────────────────────────────────────────

interface AcousticComparisonTableProps {
  features: FeatureVector;
  referenceFeatures: FeatureVector;
}

const AcousticComparisonTable: React.FC<AcousticComparisonTableProps> = ({ features, referenceFeatures }) => (
  <div className="space-y-2">
    {/* Header row */}
    <div className="grid grid-cols-3 gap-2 text-xs text-gray-400 px-2 pb-1 border-b border-gray-700/50">
      <span></span>
      <span className="text-center">Your reference</span>
      <span className="text-center">This match</span>
    </div>
    {/* Dimension rows */}
    {ACOUSTIC_DIMENSIONS.map(({ key, label }) => {
      const refLabel = getAcousticLabel(referenceFeatures, key);
      const matchLabel = getAcousticLabel(features, key);
      const isSame = refLabel === matchLabel;

      return (
        <div
          key={key}
          className={`grid grid-cols-3 gap-2 items-center px-2 py-1.5 rounded ${
            isSame ? 'bg-gray-800/30' : 'bg-amber-500/5 border border-amber-500/10'
          }`}
        >
          <div className="flex items-center gap-2">
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: ACOUSTIC_COLORS[label] }}
            />
            <span className="text-xs font-medium text-gray-300">{label}</span>
          </div>
          <span className={`text-xs text-center ${isSame ? 'text-gray-400' : 'text-blue-400'}`}>
            {refLabel}
          </span>
          <span className={`text-xs text-center ${isSame ? 'text-gray-400' : 'text-amber-400'}`}>
            {matchLabel}
          </span>
        </div>
      );
    })}
  </div>
);

// ── Main component ────────────────────────────────────────────────────────

export const FeatureVisualizations: React.FC<FeatureVisualizationsProps> = ({
  features,
  referenceFeatures,
  showComparison = false,
}) => {
  if (!features) return null;

  const isComparing = showComparison && !!referenceFeatures;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold mb-1 text-gray-300">
          {isComparing ? 'How this match compares to your reference' : 'Acoustic fingerprint'}
        </h3>
        <p className="text-sm text-gray-400">
          {isComparing
            ? 'Orange = this match · Blue = your reference'
            : 'A snapshot of what this track is doing acoustically.'}
        </p>
      </div>

      {/* Chart 1: MFCC Timbral Profile — comparison mode only */}
      {isComparing && (
        <div className="bg-gray-800/50 p-4 rounded-lg">
          <h4 className="text-sm font-medium text-gray-300 mb-1">
            Timbral Profile
          </h4>
          <p className="text-xs text-gray-400 mb-3">
            Instrument color and character. Where bars diverge, the tracks sound different in timbre — even if energy and brightness match.
          </p>
          <div className="sr-only">
            {buildMfccSrSummary(buildMfccData(features, referenceFeatures!))}
          </div>
          <MfccChart data={buildMfccData(features, referenceFeatures!)} />
        </div>
      )}

      {/* Chart 2: Harmonic Content (Chroma) — always shown */}
      <div className="bg-gray-800/50 p-4 rounded-lg">
        <h4 className="text-sm font-medium text-gray-300 mb-1">
          Harmonic Content
        </h4>
        <p className="text-xs text-gray-400 mb-3">
          Which pitch classes are most present. Taller bars = stronger harmonic presence.
        </p>
        <div className="sr-only">
          {buildChromaSrSummary(features)}
          {isComparing && referenceFeatures && ` Reference: ${buildChromaSrSummary(referenceFeatures)}`}
        </div>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart
            data={buildChromaData(features, isComparing ? referenceFeatures : null)}
            margin={{ top: 5, right: 10, bottom: 5, left: 0 }}
            barCategoryGap="20%"
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
            <XAxis dataKey="note" stroke="#9CA3AF" tick={{ fontSize: 11 }} />
            <YAxis
              stroke="#9CA3AF"
              width={35}
              tick={{ fontSize: 11 }}
              domain={[0, 1]}
              ticks={[0, 0.25, 0.5, 0.75, 1]}
              tickFormatter={(v: number) => v.toFixed(1)}
            />
            <Tooltip
              {...tooltipStyle}
              formatter={(value: number | undefined) => value != null ? (value * 100).toFixed(0) + '%' : ''}
            />
            {isComparing && (
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
            )}
            <Bar
              dataKey="active"
              fill={isComparing ? '#F59E0B' : '#6366F1'}
              name={isComparing ? 'This match' : 'Energy'}
              radius={[2, 2, 0, 0]}
            />
            {isComparing && (
              <Bar
                dataKey="reference"
                fill="#3B82F6"
                name="Your reference"
                radius={[2, 2, 0, 0]}
              />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Chart 3: Acoustic Properties — combined dimensions */}
      <div className="bg-gray-800/50 p-4 rounded-lg">
        <h4 className="text-sm font-medium text-gray-300 mb-1">
          Acoustic Properties
        </h4>
        <p className="text-xs text-gray-400 mb-3">
          {isComparing
            ? 'Highlighted rows show where the tracks diverge.'
            : 'The five dimensions that define this track\'s emotional character.'}
        </p>
        {isComparing ? (
          <AcousticComparisonTable
            features={features}
            referenceFeatures={referenceFeatures!}
          />
        ) : (
          <AcousticSummary features={features} />
        )}
      </div>
    </div>
  );
};