// ── Explanation Service ───────────────────────────────────────────────────
// Translates a FeatureVector into a plain-language blurb for directors /
// editors who need to quickly understand what a track is doing acoustically.
//
// Two modes:
//   Single vector  → reference track description ("What am I hearing?")
//   Two vectors    → match explanation ("Why does this work for my reference?")
//
// Provider-agnostic: all provider differences are handled via llmProvider.ts.
// To swap models, change ACTIVE_PROVIDER in that file — nothing here changes.

import { FeatureVector } from '../workers/featureExtraction.types';
import { ACTIVE_PROVIDER, getActiveConfig } from '../config/llmProvider';

// ── Public API ────────────────────────────────────────────────────────────

export const explanationService = {
  /**
   * Describe a reference track in plain language.
   * Fires on demand via "What am I hearing?" button.
   */
  explain: async (featureVector: FeatureVector): Promise<string> => {
    const prompt = buildReferencePrompt(featureVector);
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
Speak directly, like a person — not a product description. Open with what the track *feels* like or *does*, not what it "is".

Acoustic properties of the track:
${features}

In 2–3 sentences: describe the feeling this track creates and what kind of scene it would serve.
No jargon. No bullet points. Start with the emotion or the image, not with "This track" or "The track".`;
}

function buildComparisonPrompt(ref: FeatureVector, match: FeatureVector): string {
  const sharedTraits = findSharedTraits(ref, match);
  const divergentTraits = findDivergentTraits(ref, match);

  return `You are a music supervisor explaining a track recommendation to a film editor in a cutting room.
The editor has a reference track they love. You're telling them why this suggested royalty-free track will serve the same need.
Be direct and specific. Speak like a person, not a product description.

What this suggestion shares with the reference:
${sharedTraits}

Where this suggestion differs from the reference:
${divergentTraits}

In 2–3 sentences: explain why this suggestion works for the same scene as the reference, and note any meaningful difference the editor should know about.
No jargon. No bullet points. Start with what they have in common, not with "This track" or "The track".`;
}

// ── Shared vs divergent trait analysis ───────────────────────────────────
// These functions compare two vectors and produce human-readable labels
// for what converges and what diverges between reference and match.

function findSharedTraits(ref: FeatureVector, match: FeatureVector): string {
  const traits: string[] = [];

  const refArc = classifyArc(ref.rms[0], ref.rms[2]);
  const matchArc = classifyArc(match.rms[0], match.rms[2]);
  if (refArc === matchArc) {
    traits.push(`Energy arc: both ${refArc}`);
  }

  const refLevel = classifyLevel(ref.rms[1]);
  const matchLevel = classifyLevel(match.rms[1]);
  if (refLevel === matchLevel) {
    traits.push(`Overall energy level: both ${refLevel}`);
  }

  const refBright = classifyBrightness(ref.centroid[1]);
  const matchBright = classifyBrightness(match.centroid[1]);
  if (refBright === matchBright) {
    traits.push(`Brightness: both ${refBright}`);
  }

  const refTexture = classifyTexture(ref.flatness[1]);
  const matchTexture = classifyTexture(match.flatness[1]);
  if (refTexture === matchTexture) {
    traits.push(`Texture: both ${refTexture}`);
  }

  const refWarmth = classifyWarmth(ref.mfcc_1[1]);
  const matchWarmth = classifyWarmth(match.mfcc_1[1]);
  if (refWarmth === matchWarmth) {
    traits.push(`Timbral character: both ${refWarmth}`);
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
  const traits: string[] = [];

  const refBright = classifyBrightness(ref.centroid[1]);
  const matchBright = classifyBrightness(match.centroid[1]);
  if (refBright !== matchBright) {
    traits.push(`Brightness: reference is ${refBright}, suggestion is ${matchBright}`);
  }

  const refArc = classifyArc(ref.rms[0], ref.rms[2]);
  const matchArc = classifyArc(match.rms[0], match.rms[2]);
  if (refArc !== matchArc) {
    traits.push(`Energy arc: reference is ${refArc}, suggestion is ${matchArc}`);
  }

  const refWidth = classifyWidth(ref.spread[1]);
  const matchWidth = classifyWidth(match.spread[1]);
  if (refWidth !== matchWidth) {
    traits.push(`Frequency width: reference is ${refWidth}, suggestion is ${matchWidth}`);
  }

  const refTexture = classifyTexture(ref.flatness[1]);
  const matchTexture = classifyTexture(match.flatness[1]);
  if (refTexture !== matchTexture) {
    traits.push(`Texture: reference is ${refTexture}, suggestion is ${matchTexture}`);
  }

  return traits.length > 0
    ? traits.join('\n')
    : 'Very close overall — minimal meaningful differences';
}

// ── Classifier helpers ────────────────────────────────────────────────────
// Return discrete labels used in both comparison and single-track description.

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
  if (centroidP50 > 4000) return 'bright / airy';
  if (centroidP50 > 2000) return 'mid-balanced';
  if (centroidP50 > 1000) return 'warm / mid-heavy';
  return 'dark / bass-heavy';
}

function classifyTexture(flatnessP50: number): string {
  if (flatnessP50 > 0.4) return 'noisy / washy';
  if (flatnessP50 > 0.15) return 'mixed tonal/textural';
  return 'tonal / clean';
}

function classifyWidth(spreadP50: number): string {
  if (spreadP50 > 3000) return 'wide / full spectrum';
  if (spreadP50 > 1500) return 'medium width';
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
  ];
  return lines.filter(Boolean).join('\n');
}

function describeArc(p25: number, p50: number, p75: number): string {
  const arc = classifyArc(p25, p75);
  const level = classifyLevel(p50);
  if (arc === 'building / escalating') return `Energy arc: builds — starts quiet, escalates to ${level}`;
  if (arc === 'fading / winding down') return `Energy arc: starts ${level} and fades out`;
  return `Energy arc: steady ${level} throughout — no major swells or drops`;
}

function describeBrightness(centroidP50: number): string {
  const label = classifyBrightness(centroidP50);
  const descriptions: Record<string, string> = {
    'bright / airy':    'Brightness: high — treble-forward, airy, thin',
    'mid-balanced':     'Brightness: mid — balanced, present without harshness',
    'warm / mid-heavy': 'Brightness: warm — mid-heavy, body without brightness',
    'dark / bass-heavy':'Brightness: dark — bass-heavy, low and dense',
  };
  return descriptions[label] ?? '';
}

function describeTexture(flatnessP50: number): string {
  const label = classifyTexture(flatnessP50);
  const descriptions: Record<string, string> = {
    'noisy / washy':        'Texture: noisy / washy — more sound design than melody',
    'mixed tonal/textural': 'Texture: mixed — blend of tonal and textural elements',
    'tonal / clean':        'Texture: tonal — clean melodic or harmonic content, not much noise',
  };
  return descriptions[label] ?? '';
}

function describeWidth(spreadP50: number): string {
  const label = classifyWidth(spreadP50);
  const descriptions: Record<string, string> = {
    'wide / full spectrum': 'Frequency width: wide — full and lush, uses the whole spectrum',
    'medium width':         'Frequency width: medium — balanced presence across registers',
    'narrow / focused':     'Frequency width: narrow — focused, sparse, not a lot of frequency filling',
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
  if (spread < 0.05) return 'Harmonic content: tonally ambiguous — no clear pitch center';
  if (spread < 0.12) return `Harmonic content: mild — gentle harmonic presence around ${top}`;
  return `Harmonic content: strong — concentrated around ${top}`;
}

function describeTimbral(mfcc1P50: number): string {
  const label = classifyWarmth(mfcc1P50);
  const descriptions: Record<string, string> = {
    'warm and full-bodied': 'Timbre: warm and full-bodied — low-frequency energy dominates',
    'balanced':             'Timbre: balanced — neither particularly warm nor bright in character',
    'lean and bright':      'Timbre: lean and bright — upper partials prominent, not a heavy sound',
  };
  return descriptions[label] ?? '';
}

// ── API call — provider-aware ─────────────────────────────────────────────

async function callProvider(prompt: string): Promise<string> {
  const config = getActiveConfig();
  const apiKey = process.env[config.apiKeyEnvVar];

  if (!apiKey) {
    throw new Error(
      `Missing API key: set ${config.apiKeyEnvVar} in .env.local (local) ` +
      `or in Vercel environment variables (production).`
    );
  }

  if (ACTIVE_PROVIDER === 'anthropic') {
    return callAnthropic(prompt, apiKey, config.model, config.maxTokens);
  }

  return callOpenAICompatible(prompt, apiKey, config);
}

async function callOpenAICompatible(
  prompt: string,
  apiKey: string,
  config: ReturnType<typeof getActiveConfig>
): Promise<string> {
  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': config.authHeader(apiKey),
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: config.maxTokens,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.4,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`${ACTIVE_PROVIDER} API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() ?? '';
}

async function callAnthropic(
  prompt: string,
  apiKey: string,
  model: string,
  maxTokens: number
): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  return data.content?.[0]?.text?.trim() ?? '';
}