/**
 * diagnose_extraction.js
 *
 * Diagnostic tool for investigating the percentile-ordering bug found
 * in Schubert D.784 and "The Reins - Blue Deer". Re-extracts these two
 * tracks using the same Meyda config as scripts/pipeline/extract_features.js
 * AND additionally reports per-frame NaN counts before percentile computation.
 *
 * Hypothesis: NaN values pass the `!= null` guard in extract_features.js and
 * end up in the percentile accumulator. JavaScript's sort can't order NaN
 * correctly, causing out-of-order percentile output.
 *
 * Usage:
 *   node scripts/investigation/diagnose_extraction.js
 *
 * Run from project root. Does not modify the library.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const Meyda = require('meyda');

// ── Config (must match scripts/pipeline/extract_features.js exactly) ──────────

const SAMPLE_RATE = 44100;
const BUFFER_SIZE = 2048;
const HOP_LENGTH = 512;
const N_MFCC = 13;
const N_CHROMA = 12;
const PERCENTILES = [25, 50, 75];

Meyda.sampleRate = SAMPLE_RATE;
Meyda.numberOfMFCCCoefficients = N_MFCC;

const MEYDA_FEATURES = [
  'rms',
  'zcr',
  'spectralCentroid',
  'spectralSpread',
  'spectralFlatness',
  'mfcc',
  'chroma',
];

// ── Target tracks ─────────────────────────────────────────────────────────────

const TARGETS = [
  {
    label: 'Schubert D.784',
    path: './data/musopen/Musopen DVD/Schubert - The Piano Sonatas/Sonata in A Minor, D. 784 - I. Allegro giusto.mp3',
    libraryKey: 'musopen/Musopen DVD/Schubert - The Piano Sonatas/Sonata in A Minor, D. 784 - I. Allegro giusto.mp3',
  },
  {
    label: 'The Reins - Blue Deer',
    path: './data/youtube/batch2/The Reins - Blue Deer.mp3',
    libraryKey: 'youtube/batch2/The Reins - Blue Deer.mp3',
  },
];

const LIBRARY_PATH = './public/data/feature_vectors.json';

// ── Helpers ───────────────────────────────────────────────────────────────────

function percentile(sortedArr, p) {
  const idx = (p / 100) * (sortedArr.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sortedArr[lower];
  return sortedArr[lower] + (idx - lower) * (sortedArr[upper] - sortedArr[lower]);
}

function percentileSnapshot(frames) {
  if (!frames || frames.length === 0) return [0, 0, 0];
  const sorted = [...frames].sort((a, b) => a - b);
  return PERCENTILES.map(p => percentile(sorted, p));
}

// Diagnostic variant: returns {snapshot, nanCount, sortedHasNaN}
function percentileSnapshotDiagnostic(frames) {
  if (!frames || frames.length === 0) {
    return { snapshot: [0, 0, 0], totalFrames: 0, nanCount: 0, sortedHasNaN: false };
  }
  const totalFrames = frames.length;
  const nanCount = frames.filter(v => Number.isNaN(v)).length;
  const sorted = [...frames].sort((a, b) => a - b);
  // Check if any NaN survived in the sorted array at positions we'd sample
  const sortedHasNaN = sorted.some(v => Number.isNaN(v));
  const snapshot = PERCENTILES.map(p => percentile(sorted, p));
  return { snapshot, totalFrames, nanCount, sortedHasNaN };
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

  if (result.status !== 0) {
    const stderr = result.stderr ? result.stderr.toString().slice(0, 300) : '(no stderr)';
    console.error(`  ffmpeg error (exit ${result.status}): ${stderr}`);
    return null;
  }

  const buf = result.stdout;
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

/**
 * Re-extract features with NaN tracking. This mirrors extract_features.js
 * but retains NaN values in the accumulators so we can count them explicitly.
 * The accumulator guard uses `!= null` identical to the pipeline script.
 */
function extractWithDiagnostics(filePath) {
  const samples = decodeAudio(filePath);
  if (!samples) return null;

  const acc = {
    rms: [],
    zcr: [],
    spectralCentroid: [],
    spectralSpread: [],
    spectralFlatness: [],
    mfcc: Array.from({ length: N_MFCC }, () => []),
    chroma: Array.from({ length: N_CHROMA }, () => []),
  };

  const totalFrames = Math.floor((samples.length - BUFFER_SIZE) / HOP_LENGTH) + 1;
  let processedFrames = 0;
  let meydaErrors = 0;

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
      meydaErrors++;
      continue;
    }
    if (!feats) continue;
    processedFrames++;

    // SAME GUARD AS extract_features.js: `!= null` — does NOT catch NaN
    if (feats.rms != null) acc.rms.push(feats.rms);
    if (feats.zcr != null) acc.zcr.push(feats.zcr);
    if (feats.spectralCentroid != null) acc.spectralCentroid.push(feats.spectralCentroid);
    if (feats.spectralSpread != null) acc.spectralSpread.push(feats.spectralSpread);
    if (feats.spectralFlatness != null) acc.spectralFlatness.push(feats.spectralFlatness);

    if (Array.isArray(feats.mfcc)) {
      feats.mfcc.forEach((v, i) => { if (v != null) acc.mfcc[i].push(v); });
    }
    if (Array.isArray(feats.chroma)) {
      feats.chroma.forEach((v, i) => { if (v != null) acc.chroma[i].push(v); });
    }
  }

  return {
    totalFrames,
    processedFrames,
    meydaErrors,
    diagnostics: {
      rms: percentileSnapshotDiagnostic(acc.rms),
      zcr: percentileSnapshotDiagnostic(acc.zcr),
      centroid: percentileSnapshotDiagnostic(acc.spectralCentroid),
      spread: percentileSnapshotDiagnostic(acc.spectralSpread),
      flatness: percentileSnapshotDiagnostic(acc.spectralFlatness),
      mfcc: acc.mfcc.map(arr => percentileSnapshotDiagnostic(arr)),
      chroma: acc.chroma.map(arr => percentileSnapshotDiagnostic(arr)),
    },
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

function formatTriple(triple) {
  return '[' + triple.map(v => {
    if (Number.isNaN(v)) return '   NaN  ';
    return v.toFixed(4).padStart(8);
  }).join(', ') + ']';
}

function isOrdered(triple) {
  if (triple.some(v => Number.isNaN(v))) return false;
  return triple[0] <= triple[1] && triple[1] <= triple[2];
}

function main() {
  console.log('Loading library...');
  const library = JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf8'));
  const libraryByPath = new Map(library.map(t => [t.file.replace(/^\.\/data\//, ''), t.features]));

  for (const target of TARGETS) {
    console.log('\n' + '='.repeat(100));
    console.log(`TRACK: ${target.label}`);
    console.log(`PATH:  ${target.path}`);
    console.log('='.repeat(100));

    if (!fs.existsSync(target.path)) {
      console.log(`  File not found locally. Skipping.`);
      continue;
    }

    console.log('\nRe-extracting...');
    const result = extractWithDiagnostics(target.path);
    if (!result) {
      console.log('  Extraction failed.');
      continue;
    }

    console.log(`  Total frames: ${result.totalFrames}`);
    console.log(`  Processed:    ${result.processedFrames}`);
    console.log(`  Meyda errors: ${result.meydaErrors}`);

    const libFeatures = libraryByPath.get(target.libraryKey);

    console.log('\nNaN counts in per-frame accumulators (before percentile sort):');
    console.log('  feature         total    NaN    sorted has NaN?');
    console.log('  ' + '-'.repeat(50));

    const diag = result.diagnostics;
    const scalarNames = ['rms', 'zcr', 'centroid', 'spread', 'flatness'];
    for (const name of scalarNames) {
      const d = diag[name];
      const marker = d.nanCount > 0 ? '  <-- NaN PRESENT' : '';
      console.log(`  ${name.padEnd(14)} ${String(d.totalFrames).padStart(6)} ${String(d.nanCount).padStart(6)}    ${d.sortedHasNaN ? 'YES' : 'no '}${marker}`);
    }

    // MFCC and chroma — only show if there are NaN issues
    const mfccNanTotal = diag.mfcc.reduce((s, d) => s + d.nanCount, 0);
    const chromaNanTotal = diag.chroma.reduce((s, d) => s + d.nanCount, 0);
    console.log(`  mfcc (all 13)  ${String(diag.mfcc[0].totalFrames).padStart(6)} ${String(mfccNanTotal).padStart(6)}    (aggregated)`);
    console.log(`  chroma (all 12)${String(diag.chroma[0].totalFrames).padStart(6)} ${String(chromaNanTotal).padStart(6)}    (aggregated)`);

    console.log('\nPercentile comparison (re-extracted vs library):');
    console.log('  feature       re-extracted [p25,p50,p75]                library [p25,p50,p75]                     match?  re-ordered?  library-ordered?');
    console.log('  ' + '-'.repeat(150));

    for (const name of scalarNames) {
      const newTriple = diag[name].snapshot;
      const libTriple = libFeatures ? libFeatures[name] : null;
      const match = libTriple && newTriple.every((v, i) => Math.abs(v - libTriple[i]) < 0.0001);
      const newOrdered = isOrdered(newTriple);
      const libOrdered = libTriple ? isOrdered(libTriple) : null;

      const matchStr = libTriple ? (match ? 'YES' : 'NO ') : '---';
      const newOrderedStr = newOrdered ? 'YES' : 'NO ';
      const libOrderedStr = libTriple ? (libOrdered ? 'YES' : 'NO ') : '---';

      console.log(
        `  ${name.padEnd(12)} ${formatTriple(newTriple)}  ${libTriple ? formatTriple(libTriple) : '(not in library)'.padEnd(42)}  ${matchStr}     ${newOrderedStr}          ${libOrderedStr}`
      );
    }
  }

  console.log('\n' + '='.repeat(100));
  console.log('INTERPRETATION GUIDE');
  console.log('='.repeat(100));
  console.log(`
If 'NaN PRESENT' appears for the broken features (centroid, spread, flatness):
  -> Confirms the hypothesis. NaN values bypass the '!= null' guard and corrupt the sort.
  -> Fix: change guard to '!= null && !Number.isNaN(value)' in extract_features.js

If re-extracted values match library exactly AND are out of order:
  -> Extraction is deterministic and reproducibly broken. Same root cause as current data.

If re-extracted values differ from library:
  -> Non-determinism or something changed. Needs deeper investigation.

If re-extracted values are now in correct order but library values aren't:
  -> The bug has already been fixed somewhere upstream, we just need to re-extract affected tracks.
`);
}

main();