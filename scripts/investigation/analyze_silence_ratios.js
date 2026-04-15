/**
 * analyze_silence_ratios.js
 *
 * Measures the silence ratio (NaN centroid frames / total frames) for every
 * track in the runtime library. Centroid NaN is the most reliable silence
 * proxy — it only occurs when spectral energy is zero or near-zero, which
 * means the frame is genuinely silent.
 *
 * Output: a sorted table from highest to lowest silence ratio, plus a
 * distribution summary so we can pick a QA threshold with real data.
 *
 * This script does NOT modify the library. Read-only diagnostic.
 *
 * Usage:
 *   node scripts/investigation/analyze_silence_ratios.js
 *
 * Run from project root (SceneSync/).
 * Expected runtime: 15-30 minutes for 373 tracks.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const Meyda = require('meyda');

// ── Config (must match extract_features.js exactly) ───────────────────────────

const SAMPLE_RATE = 44100;
const BUFFER_SIZE = 2048;
const HOP_LENGTH  = 512;

Meyda.sampleRate = SAMPLE_RATE;

// Only extract centroid — we don't need the full feature set for this diagnostic
const MEYDA_FEATURES = ['spectralCentroid'];

const LIBRARY_PATH = './public/data/feature_vectors.json';

// Path prefix → local data directory mapping
const PATH_PREFIXES = {
  'fma_small/':  './data/fma_small/',
  'musopen/':    './data/musopen/',
  'youtube/':    './data/youtube/',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveLocalPath(libraryFilePath) {
  for (const [prefix, localDir] of Object.entries(PATH_PREFIXES)) {
    if (libraryFilePath.startsWith(prefix)) {
      return localDir + libraryFilePath.slice(prefix.length);
    }
  }
  return null;
}

function decodeAudio(filePath) {
  const result = spawnSync(
    'ffmpeg',
    [
      '-i', filePath,
      '-ac', '1',
      '-ar', String(SAMPLE_RATE),
      '-f', 'f32le',
      '-acodec', 'pcm_f32le',
      'pipe:1',
    ],
    {
      maxBuffer: 300 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  if (result.status !== 0) return null;

  const buf = result.stdout;
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

function measureSilenceRatio(filePath) {
  const samples = decodeAudio(filePath);
  if (!samples) return null;

  const totalFrames = Math.floor((samples.length - BUFFER_SIZE) / HOP_LENGTH) + 1;
  let nanFrames = 0;
  let processedFrames = 0;

  for (let frame = 0; frame < totalFrames; frame++) {
    const start = frame * HOP_LENGTH;
    const signal = samples.slice(start, start + BUFFER_SIZE);
    if (signal.length < BUFFER_SIZE) break;

    let feats;
    try {
      feats = Meyda.extract(MEYDA_FEATURES, signal, {
        sampleRate: SAMPLE_RATE,
        bufferSize: BUFFER_SIZE,
      });
    } catch {
      continue;
    }
    if (!feats) continue;

    processedFrames++;
    if (feats.spectralCentroid == null || Number.isNaN(feats.spectralCentroid)) {
      nanFrames++;
    }
  }

  if (processedFrames === 0) return null;

  return {
    totalFrames: processedFrames,
    nanFrames,
    silenceRatio: nanFrames / processedFrames,
  };
}

function sourceFromPath(filePath) {
  if (filePath.startsWith('fma_small/'))  return 'FMA';
  if (filePath.startsWith('musopen/'))    return 'Musopen';
  if (filePath.startsWith('youtube/'))    return 'YouTube';
  return 'Unknown';
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  console.log('Loading library...');
  const library = JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf8'));
  console.log(`  ${library.length} tracks\n`);

  const results = [];
  let skipped = 0;

  for (let i = 0; i < library.length; i++) {
    const track = library[i];
    const filePath = track.file.replace(/^\.\/data\//, '');
    const localPath = resolveLocalPath(filePath);

    const progress = `[${String(i + 1).padStart(3)}/${library.length}]`;

    if (!localPath || !fs.existsSync(localPath)) {
      console.log(`${progress} SKIP (file not found): ${filePath}`);
      skipped++;
      continue;
    }

    const measurement = measureSilenceRatio(localPath);

    if (!measurement) {
      console.log(`${progress} SKIP (decode failed): ${filePath}`);
      skipped++;
      continue;
    }

    const pct = (measurement.silenceRatio * 100).toFixed(2);
    const marker = measurement.silenceRatio > 0.05 ? '  <-- FLAG' : '';
    console.log(`${progress} ${pct.padStart(6)}% silent  ${filePath}${marker}`);

    results.push({
      file: filePath,
      source: sourceFromPath(filePath),
      totalFrames: measurement.totalFrames,
      nanFrames: measurement.nanFrames,
      silenceRatio: measurement.silenceRatio,
    });
  }

  if (results.length === 0) {
    console.log('\nNo results — all tracks skipped or failed.');
    return;
  }

  // Sort highest silence ratio first
  results.sort((a, b) => b.silenceRatio - a.silenceRatio);

  // ── Summary ────────────────────────────────────────────────────────────────

  console.log('\n' + '='.repeat(90));
  console.log('SILENCE RATIO DISTRIBUTION');
  console.log('='.repeat(90));

  const thresholds = [0.01, 0.05, 0.10, 0.20, 0.30, 0.50];
  console.log('\nTracks above threshold (silence ratio):');
  for (const t of thresholds) {
    const count = results.filter(r => r.silenceRatio > t).length;
    const pct = ((count / results.length) * 100).toFixed(1);
    console.log(`  > ${(t * 100).toFixed(0).padStart(3)}%  →  ${String(count).padStart(3)} tracks  (${pct}% of library)`);
  }

  // Per-source breakdown
  console.log('\nPer-source median silence ratio:');
  for (const source of ['FMA', 'Musopen', 'YouTube']) {
    const subset = results.filter(r => r.source === source);
    if (subset.length === 0) continue;
    const sorted = [...subset].sort((a, b) => a.silenceRatio - b.silenceRatio);
    const median = sorted[Math.floor(sorted.length / 2)].silenceRatio;
    const max = sorted[sorted.length - 1].silenceRatio;
    console.log(`  ${source.padEnd(8)}  median ${(median * 100).toFixed(2)}%  max ${(max * 100).toFixed(2)}%  (${subset.length} tracks)`);
  }

  // ── Top 20 highest silence ratio ──────────────────────────────────────────

  console.log('\n' + '='.repeat(90));
  console.log('TOP 20 TRACKS BY SILENCE RATIO');
  console.log('='.repeat(90));
  console.log(`  ${'silence%'.padStart(8)}  ${'NaN frames'.padStart(10)}  ${'total frames'.padStart(12)}  source     file`);
  console.log('  ' + '-'.repeat(85));

  for (const r of results.slice(0, 20)) {
    const pct = (r.silenceRatio * 100).toFixed(2).padStart(8);
    console.log(`  ${pct}%  ${String(r.nanFrames).padStart(10)}  ${String(r.totalFrames).padStart(12)}  ${r.source.padEnd(9)}  ${r.file}`);
  }

  // ── Save full results to JSON ─────────────────────────────────────────────

  const outputPath = './scripts/investigation/silence_ratios.json';
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n✅  Full results saved to ${outputPath}`);
  console.log(`    Skipped: ${skipped} tracks (file not found locally or decode failed)`);
  console.log('\nNext step: review the distribution above, then decide on a QA threshold.');
}

main();