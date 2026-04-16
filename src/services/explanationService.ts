// ── Explanation Service ───────────────────────────────────────────────────
// Translates a FeatureVector into a plain-language blurb for directors /
// editors who need to quickly understand what a track is doing acoustically.
//
// Two modes:
//   Single vector  → reference track description ("What am I hearing?")
//   Two vectors    → match explanation ("Why does this work for my reference?")
//
// Provider-agnostic: LLM provider selection handled server-side in api/explain.js.
// To swap models, change LLM_PROVIDER env var in Vercel — nothing here changes.

import { FeatureVector } from '../workers/featureExtraction.types';

// ── Public API ────────────────────────────────────────────────────────────

export const explanationService = {
  /**
   * Describe a reference track in plain language.
   * Fires on demand via "What am I hearing?" button.
   */
  explain: async (featureVector: FeatureVector): Promise<string> => {
    const prompt = buildReferencePrompt(featureVector);
    console.log(prompt);
    return callProvider(prompt);
  },

  /**
   * Explain why a match track works for a given reference.
   * Fires automatically when user selects a match card.
   */
  explainMatch: async (
    referenceVector: FeatureVector,
    matchVector: FeatureVector
  ): Promise<string> => {
    const prompt = buildComparisonPrompt(referenceVector, matchVector);
    return callProvider(prompt);
  },
};

// ── Prompt construction ───────────────────────────────────────────────────

function buildReferencePrompt(fv: FeatureVector): string {
  const features = describeVector(fv);

  return `You are a music supervisor giving a quick verbal take to a film editor in a cutting room.
Speak directly and specifically — not a product description, not a first-person narrator. No "I would", "I'd", "Honestly," or similar.
Explain the acoustic reasons behind your observations — connect what you hear to what the numbers show.

Acoustic properties of the track:
${features}

In 4–5 sentences: describe the feeling this track creates, what kind of scene it would serve, and why — connecting the acoustic properties to the emotional effect.
Use causal language — explain why qualities produce the feelings they do.
No jargon. No bullet points.

Choose ONE of these entry points based on what is most distinctive about this track:
- Lead with the energy arc (how it moves — builds, holds, fades)
- Lead with the specific scene or moment it fits
- Lead with the most striking acoustic quality (harmonic character, texture, brightness)

Don't open with "This track" or "The track". Don't open with sensation or texture words like "deep", "warm", "rich", "lush", or "heavy".`;
}

function buildComparisonPrompt(ref: FeatureVector, match: FeatureVector): string {
  const sharedTraits = findSharedTraits(ref, match);
  const divergentTraits = findDivergentTraits(ref, match);
  const timbralComparison = compareTimbralProfiles(ref, match);

  return `You are a music supervisor explaining a track recommendation to a film editor in a cutting room.
The editor has a reference track they love. You're telling them why this suggested royalty-free track will serve the same need.
Be direct and specific. Speak like a person, not a product description.
Explain the acoustic reasons behind your observations — connect what you hear to what the numbers show.

What this suggestion shares with the reference:
${sharedTraits}

Where this suggestion differs from the reference:
${divergentTraits}

Timbral profiles of both tracks:
${timbralComparison}

In 3–4 sentences: tell the editor why this suggestion will serve the same scene need, and flag the most important difference they should know about.
Use causal language — explain why qualities produce the feelings they do.
No jargon. No bullet points.

Choose ONE of these entry points based on what is most useful:
- Lead with the strongest shared quality (what makes this a valid substitute)
- Lead with the key difference (the most important thing the editor should know)
- Lead with whether this fits the same scene moment or a close adjacent one

Don't open with "This track" or "The track". Don't open with sensation or texture words like "deep", "warm", "rich", "lush", or "heavy".`;
}

// ── Directional comparison helpers ───────────────────────────────────────
// Each returns { label, magnitude } or null if the difference is not
// perceptually meaningful. magnitude is normalized [0, 1] — used to sort
// divergent traits so the most significant difference leads the prompt.
//
// Range constants (120 bins, 0.2 RMS, 80 bins, etc.) are empirical —
// derived from observing value distributions across the 243-track library.
// They are not Meyda spec values. Re-evaluate if the library grows
// significantly or extraction parameters change.

type TraitComparison = { label: string; magnitude: number };

function degreeWord(normalized: number): string {
  if (normalized > 0.5) return 'significantly';
  if (normalized > 0.25) return 'noticeably';
  return 'slightly';
}

function compareBrightness(ref: number, match: number): TraitComparison | null {
  // spectral centroid: Meyda outputs in bins, not Hz. Practical range ~0–120 bins.
  const range = 120;
  const normalized = Math.abs(match - ref) / range;
  if (normalized < 0.08) return null;
  const direction = match > ref ? 'brighter' : 'darker';
  return {
    label: `Brightness: ${degreeWord(normalized)} ${direction} than your reference (ref: ${ref.toFixed(1)} bins, match: ${match.toFixed(1)} bins)`,
    magnitude: normalized,
  };
}

function compareEnergy(ref: number, match: number): TraitComparison | null {
  // rms: practical range ~0–0.2
  const range = 0.2;
  const normalized = Math.abs(match - ref) / range;
  if (normalized < 0.1) return null;
  const direction = match > ref ? 'more energetic' : 'quieter';
  return {
    label: `Energy level: ${degreeWord(normalized)} ${direction} than your reference (ref: ${ref.toFixed(3)}, match: ${match.toFixed(3)})`,
    magnitude: normalized,
  };
}

function compareWidth(ref: number, match: number): TraitComparison | null {
  // spectral spread: Meyda outputs in bins, not Hz. Practical range ~0–80 bins.
  const range = 80;
  const normalized = Math.abs(match - ref) / range;
  if (normalized < 0.08) return null;
  const direction = match > ref ? 'wider / fuller in spectrum' : 'narrower / more focused';
  return {
    label: `Frequency width: ${degreeWord(normalized)} ${direction} than your reference (ref: ${ref.toFixed(1)} bins, match: ${match.toFixed(1)} bins)`,
    magnitude: normalized,
  };
}

function compareTexture(ref: number, match: number): TraitComparison | null {
  // spectral flatness: range 0–1
  const normalized = Math.abs(match - ref);
  if (normalized < 0.1) return null;
  const direction = match > ref ? 'noisier / more textural' : 'more tonal / cleaner';
  return {
    label: `Texture: ${degreeWord(normalized)} ${direction} than your reference (ref: ${ref.toFixed(3)}, match: ${match.toFixed(3)})`,
    magnitude: normalized,
  };
}

function compareWarmth(ref: number, match: number): TraitComparison | null {
  // mfcc_1: practical range roughly -50–100
  const range = 150;
  const normalized = Math.abs(match - ref) / range;
  if (normalized < 0.1) return null;
  const direction = match > ref ? 'warmer / fuller bodied' : 'leaner / brighter in character';
  return {
    label: `Timbre: ${degreeWord(normalized)} ${direction} than your reference (ref: ${ref.toFixed(1)}, match: ${match.toFixed(1)})`,
    magnitude: normalized,
  };
}

// ── Shared vs divergent trait analysis ───────────────────────────────────

function findSharedTraits(ref: FeatureVector, match: FeatureVector): string {
  const traits: string[] = [];

  const refArc = classifyArc(ref.rms[0], ref.rms[2]);
  const matchArc = classifyArc(match.rms[0], match.rms[2]);
  if (refArc === matchArc) {
    traits.push(`Energy arc: both ${refArc}`);
  }

  if (compareBrightness(ref.centroid[1], match.centroid[1]) === null) {
    const label = classifyBrightness(ref.centroid[1]);
    traits.push(`Brightness: both ${label} (centroid: ${ref.centroid[1].toFixed(1)} bins)`);
  }

  if (compareTexture(ref.flatness[1], match.flatness[1]) === null) {
    const label = classifyTexture(ref.flatness[1]);
    traits.push(`Texture: both ${label} (flatness: ${ref.flatness[1].toFixed(3)})`);
  }

  if (compareWarmth(ref.mfcc_1[1], match.mfcc_1[1]) === null) {
    const label = classifyWarmth(ref.mfcc_1[1]);
    traits.push(`Timbral character: both ${label} (MFCC 1: ${ref.mfcc_1[1].toFixed(1)})`);
  }

  const refNote = getDominantNote(ref);
  const matchNote = getDominantNote(match);
  if (refNote === matchNote) {
    traits.push(`Harmonic center: both emphasize ${refNote}`);
  }

  return traits.length > 0
    ? traits.join('\n')
    : 'Similar overall acoustic character';
}

function findDivergentTraits(ref: FeatureVector, match: FeatureVector): string {
  const comparisons: TraitComparison[] = [
    compareBrightness(ref.centroid[1], match.centroid[1]),
    compareEnergy(ref.rms[1], match.rms[1]),
    compareWidth(ref.spread[1], match.spread[1]),
    compareTexture(ref.flatness[1], match.flatness[1]),
    compareWarmth(ref.mfcc_1[1], match.mfcc_1[1]),
  ].filter((c): c is TraitComparison => c !== null);

  const refArc = classifyArc(ref.rms[0], ref.rms[2]);
  const matchArc = classifyArc(match.rms[0], match.rms[2]);
  if (refArc !== matchArc) {
    comparisons.push({
      label: `Energy arc: reference is ${refArc}, suggestion is ${matchArc}`,
      magnitude: 0.3,
    });
  }

  comparisons.sort((a, b) => b.magnitude - a.magnitude);

  return comparisons.length > 0
    ? comparisons.slice(0, 4).map(c => c.label).join('\n')
    : 'Very close overall — minimal meaningful differences';
}

function compareTimbralProfiles(ref: FeatureVector, match: FeatureVector): string {
  return `Timbral profiles (spectral envelope shape):
  Reference — ${describeTimbralProfile(ref)}
  Suggestion — ${describeTimbralProfile(match)}`;
}

// ── Classifier helpers ────────────────────────────────────────────────────
// Discrete labels used in single-track description and shared trait fallbacks.

function classifyArc(p25: number, p75: number): string {
  if (p75 > p25 * 1.4) return 'building / escalating';
  if (p25 > p75 * 1.4) return 'fading / winding down';
  return 'steady throughout';
}

function classifyLevel(p50: number): string {
  if (p50 < 0.02) return 'quiet';
  if (p50 < 0.06) return 'moderate';
  return 'loud';
}

function classifyBrightness(centroidP50: number): string {
  // Meyda spectralCentroid in bins. Practical range ~0–120 bins.
  if (centroidP50 > 80) return 'bright / airy';
  if (centroidP50 > 50) return 'mid-balanced';
  if (centroidP50 > 25) return 'warm / mid-heavy';
  return 'dark / bass-heavy';
}

function classifyTexture(flatnessP50: number): string {
  if (flatnessP50 > 0.4) return 'noisy / washy';
  if (flatnessP50 > 0.15) return 'mixed tonal/textural';
  return 'tonal / clean';
}

function classifyWidth(spreadP50: number): string {
  // Meyda spectralSpread in bins. Practical range ~0–80 bins.
  if (spreadP50 > 50) return 'wide / full spectrum';
  if (spreadP50 > 25) return 'medium width';
  return 'narrow / focused';
}

function classifyWarmth(mfcc1P50: number): string {
  if (mfcc1P50 > 20) return 'warm and full-bodied';
  if (mfcc1P50 > 0) return 'balanced';
  return 'lean and bright';
}

function getDominantNote(fv: FeatureVector): string {
  const chromaKeys = [
    'chroma_1', 'chroma_2', 'chroma_3', 'chroma_4',
    'chroma_5', 'chroma_6', 'chroma_7', 'chroma_8',
    'chroma_9', 'chroma_10', 'chroma_11', 'chroma_12',
  ] as const;
  const noteNames = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const values = chromaKeys.map((k, i) => ({ note: noteNames[i], val: fv[k][1] }));
  values.sort((a, b) => b.val - a.val);
  const spread = values[0].val - values[11].val;
  if (spread < 0.05) return 'no clear center';
  return values[0].note;
}

// ── Single-track description helpers ─────────────────────────────────────

function describeVector(fv: FeatureVector): string {
  const lines = [
    describeArc(fv.rms[0], fv.rms[1], fv.rms[2]),
    describeBrightness(fv.centroid[1]),
    describeTexture(fv.flatness[1]),
    describeWidth(fv.spread[1]),
    describeHarmonic(fv),
    describeTimbral(fv.mfcc_1[1]),
    describeTimbralProfile(fv),
  ];
  return lines.filter(Boolean).join('\n');
}

function describeArc(p25: number, p50: number, p75: number): string {
  const arc = classifyArc(p25, p75);
  const level = classifyLevel(p50);
  if (arc === 'building / escalating') return `Energy arc: builds — starts quiet, escalates to ${level} (p25: ${p25.toFixed(3)}, p50: ${p50.toFixed(3)}, p75: ${p75.toFixed(3)})`;
  if (arc === 'fading / winding down') return `Energy arc: starts ${level} and fades out (p25: ${p25.toFixed(3)}, p50: ${p50.toFixed(3)}, p75: ${p75.toFixed(3)})`;
  return `Energy arc: steady ${level} throughout — no major swells or drops (p25: ${p25.toFixed(3)}, p50: ${p50.toFixed(3)}, p75: ${p75.toFixed(3)})`;
}

function describeBrightness(centroidP50: number): string {
  const label = classifyBrightness(centroidP50);
  const descriptions: Record<string, string> = {
    'bright / airy':    `Brightness: high — treble-forward, airy, thin (centroid: ${centroidP50.toFixed(1)} bins)`,
    'mid-balanced':     `Brightness: mid — balanced, present without harshness (centroid: ${centroidP50.toFixed(1)} bins)`,
    'warm / mid-heavy': `Brightness: warm — mid-heavy, body without brightness (centroid: ${centroidP50.toFixed(1)} bins)`,
    'dark / bass-heavy':`Brightness: dark — bass-heavy, low and dense (centroid: ${centroidP50.toFixed(1)} bins)`,
  };
  return descriptions[label] ?? '';
}

function describeTexture(flatnessP50: number): string {
  const label = classifyTexture(flatnessP50);
  const descriptions: Record<string, string> = {
    'noisy / washy':        `Texture: noisy / washy — more sound design than melody (flatness: ${flatnessP50.toFixed(3)})`,
    'mixed tonal/textural': `Texture: mixed — blend of tonal and textural elements (flatness: ${flatnessP50.toFixed(3)})`,
    'tonal / clean':        `Texture: tonal — clean melodic or harmonic content, not much noise (flatness: ${flatnessP50.toFixed(3)})`,
  };
  return descriptions[label] ?? '';
}

function describeWidth(spreadP50: number): string {
  const label = classifyWidth(spreadP50);
  const descriptions: Record<string, string> = {
    'wide / full spectrum': `Frequency width: wide — full and lush, uses the whole spectrum (spread: ${spreadP50.toFixed(1)} bins)`,
    'medium width':         `Frequency width: medium — balanced presence across registers (spread: ${spreadP50.toFixed(1)} bins)`,
    'narrow / focused':     `Frequency width: narrow — focused, sparse, not a lot of frequency filling (spread: ${spreadP50.toFixed(1)} bins)`,
  };
  return descriptions[label] ?? '';
}

function describeHarmonic(fv: FeatureVector): string {
  const chromaKeys = [
    'chroma_1', 'chroma_2', 'chroma_3', 'chroma_4',
    'chroma_5', 'chroma_6', 'chroma_7', 'chroma_8',
    'chroma_9', 'chroma_10', 'chroma_11', 'chroma_12',
  ] as const;
  const noteNames = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const values = chromaKeys.map((k, i) => ({ note: noteNames[i], val: fv[k][1] }));
  values.sort((a, b) => b.val - a.val);
  const top = values.slice(0, 3).map(v => v.note).join(', ');
  const spread = values[0].val - values[11].val;
  const minVal = values[11].val;
  const isFloor = minVal > 0.35; // all notes present at meaningful levels

  if (spread < 0.05) return 'Harmonic content: tonally ambiguous — no clear pitch center, chromatic or atonal';
  if (spread < 0.15 || isFloor) return `Harmonic content: diffuse — pitch energy spread broadly across all notes, no strong tonal center (top notes: ${top}, spread: ${spread.toFixed(3)})`;
  if (spread < 0.3) return `Harmonic content: moderate — some harmonic focus around ${top} but not strongly centered (chroma spread: ${spread.toFixed(3)})`;
  return `Harmonic content: focused — concentrated around ${top} (chroma spread: ${spread.toFixed(3)})`;
}

function describeTimbral(mfcc1P50: number): string {
  // mfcc_1 is dropped in similarity weighting (loudness-correlated) but
  // retained here for prompt context — the LLM benefits from knowing overall
  // timbral body even if it doesn't drive matching.
  const label = classifyWarmth(mfcc1P50);
  const descriptions: Record<string, string> = {
    'warm and full-bodied': `Overall timbral body: warm and full — low-frequency energy dominates (MFCC 1: ${mfcc1P50.toFixed(1)})`,
    'balanced':             `Overall timbral body: balanced — neither warm nor bright in character (MFCC 1: ${mfcc1P50.toFixed(1)})`,
    'lean and bright':      `Overall timbral body: lean and bright — upper partials prominent (MFCC 1: ${mfcc1P50.toFixed(1)})`,
  };
  return descriptions[label] ?? '';
}

function describeTimbralProfile(fv: FeatureVector): string {
  // mfcc_2 through mfcc_13 encode spectral envelope shape — the timbral
  // "fingerprint" that distinguishes instrument families and textures.
  // Treated in two groups based on library value ranges:
  //   Body (2–5): large magnitudes, high inter-track variance — most differentiating
  //   Texture (6–13): values near zero for most tracks, pattern matters more than magnitude

  const body = [
    { k: 'mfcc_2' as const, label: 'mfcc_2' },
    { k: 'mfcc_3' as const, label: 'mfcc_3' },
    { k: 'mfcc_4' as const, label: 'mfcc_4' },
    { k: 'mfcc_5' as const, label: 'mfcc_5' },
  ];

  const texture = [
    { k: 'mfcc_6'  as const, label: 'mfcc_6'  },
    { k: 'mfcc_7'  as const, label: 'mfcc_7'  },
    { k: 'mfcc_8'  as const, label: 'mfcc_8'  },
    { k: 'mfcc_9'  as const, label: 'mfcc_9'  },
    { k: 'mfcc_10' as const, label: 'mfcc_10' },
    { k: 'mfcc_11' as const, label: 'mfcc_11' },
    { k: 'mfcc_12' as const, label: 'mfcc_12' },
    { k: 'mfcc_13' as const, label: 'mfcc_13' },
  ];

  // Body description — mfcc_2 is the most variable and differentiating
  const mfcc2 = fv.mfcc_2[1];
  let bodyChar: string;
  if (mfcc2 > 49.9) bodyChar = 'very strong and full';
  else if (mfcc2 > 13.9) bodyChar = 'strong';
  else if (mfcc2 > 0) bodyChar = 'moderate';
  else bodyChar = 'weak / recessed';

  const bodyVals = body.map(b => `${b.label}: ${fv[b.k][1].toFixed(1)}`).join(', ');

  // mfcc_2 spread as timbral consistency signal (p75 - p25)
  const mfcc2Spread = fv.mfcc_2[2] - fv.mfcc_2[0];
  const consistency = mfcc2Spread < 15
    ? 'consistent timbre throughout'
    : mfcc2Spread < 35
    ? 'moderate timbral variation across the track'
    : 'significant timbral variation — timbre shifts noticeably';

  // Texture pattern — are high-order coefficients positive, negative, or near zero?
  const textureVals = texture.map(t => fv[t.k][1]);
  const texturePositive = textureVals.filter(v => v > 2).length;
  const textureNegative = textureVals.filter(v => v < -2).length;
  let textureChar: string;
  if (texturePositive > 5) textureChar = 'fine texture active — articulated, detailed upper harmonics';
  else if (textureNegative > 5) textureChar = 'fine texture suppressed — smooth, not articulated';
  else textureChar = 'fine texture mixed — moderate harmonic detail';

  const textureValStr = texture.map(t => `${t.label}: ${fv[t.k][1].toFixed(1)}`).join(', ');

  return `Timbral profile (spectral envelope shape):
  Body (mfcc_2–5): ${bodyChar} (${bodyVals})
  Texture (mfcc_6–13): ${textureChar} (${textureValStr})
  Timbral consistency: ${consistency} (mfcc_2 spread: ${mfcc2Spread.toFixed(1)})`;
}

// ── API call — via serverless proxy ───────────────────────────────────────

async function callProvider(prompt: string): Promise<string> {
  const response = await fetch('/api/explain', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Unknown error' }));
    if (response.status === 429) {
      throw new Error('RATE_LIMITED');
    }
    throw new Error(err.error || `API error ${response.status}`);
  }

  const data = await response.json();
  return data.content ?? '';
}