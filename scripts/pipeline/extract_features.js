/**
 * extract_features.js
 *
 * Meyda-based batch feature extractor for SceneSync.
 * Replaces Python MFCC extraction to guarantee alignment with the browser —
 * same Meyda library, same filterbank, same DCT convention.
 *
 * Usage:
 *   node scripts/extract_features.js fma       # FMA small → scripts/feature_vectors.json
 *   node scripts/extract_features.js musopen   # Musopen → scripts/musopen_feature_vectors.json
 *
 * Run from project root (SceneSync/).
 *
 * Dependencies:
 *   meyda       — already in node_modules (used by browser bundle)
 *   ffmpeg      — must be in PATH (brew install ffmpeg / apt install ffmpeg)
 *
 * IMPORTANT — extraction parameters:
 *   BUFFER_SIZE and N_FFT are both 2048. They must always match the browser.
 *   Never change either value without re-extracting the full library.
 *   HOP_LENGTH = 512; // Must match browser HOP_SIZE in featureExtraction.types.ts
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { spawnSync, execSync } = require('child_process');
const Meyda = require('meyda');

// ── Configuration ─────────────────────────────────────────────────────────────
// These values must match featureExtraction.worker.ts exactly.

const SAMPLE_RATE  = 44100;
const BUFFER_SIZE  = 2048;  // FFT window. Matches browser BUFFER_SIZE. See note above.
const HOP_LENGTH   = 512;   // Hop length. Matches browser. Do not increase — reduces frame count.
const N_MFCC       = 13;
const N_CHROMA     = 12;
const PERCENTILES  = [25, 50, 75];
const MIN_FRAMES   = 10;    // Skip tracks with fewer frames than this (too short / silent)
const SAVE_EVERY   = 50;    // Checkpoint interval (tracks)

// Configure Meyda globally before any extract() calls
// Do NOT set Meyda.bufferSize here — browser worker leaves it at default (512)
// and passes bufferSize per-call. We must match that behavior exactly.
Meyda.sampleRate = SAMPLE_RATE;
Meyda.numberOfMFCCCoefficients = N_MFCC;

const MEYDA_FEATURES = [
  'rms',
  'zcr',
  'spectralCentroid',
  'spectralSpread', // → stored as "spread" in the vector schema
  'spectralFlatness',
  'mfcc',
  'chroma',
];

// ── Paths ─────────────────────────────────────────────────────────────────────

const PATHS = {
  fma: {
    audioDir:     './data/fma_small',
    outputPath:   './scripts/feature_vectors.json',
    tracklistPath: null,
  },
  musopen: {
    audioDir:     null,
    outputPath:   './scripts/musopen_feature_vectors.json',
    tracklistPath: './scripts/pipeline/musopen_tracklist.md',
  },
  youtube: {
    audioDir:     './data/youtube',
    outputPath:   './scripts/youtube_feature_vectors.json',
  },
};

// ── Percentile helpers ────────────────────────────────────────────────────────

/**
 * Linear interpolation percentile on a pre-sorted array.
 * Matches numpy.percentile(interpolation='linear') — same method used in Python scripts.
 */
function percentile(sortedArr, p) {
  const idx   = (p / 100) * (sortedArr.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sortedArr[lower];
  return sortedArr[lower] + (idx - lower) * (sortedArr[upper] - sortedArr[lower]);
}

/** Returns [p25, p50, p75] snapshot — same shape as Python percentile_snapshot().
 *  Non-finite values (NaN, Infinity) are filtered before sorting. */
function percentileSnapshot(frames) {
  if (!frames || frames.length === 0) return [0, 0, 0];
  const valid = frames.filter(v => Number.isFinite(v));
  if (valid.length === 0) return [0, 0, 0];
  const sorted = [...valid].sort((a, b) => a - b);
  return PERCENTILES.map(p => percentile(sorted, p));
}

// ── Audio decoding ────────────────────────────────────────────────────────────

/**
 * Decodes an audio file to a Float32Array of mono PCM at SAMPLE_RATE via ffmpeg.
 *
 * Why ffmpeg rather than a pure-JS decoder:
 *   Node.js MP3 decoders are less battle-tested for edge cases (unusual bitrates,
 *   malformed headers). ffmpeg matches the robustness of librosa's decoder and is
 *   the right tool for a one-time batch extraction over known library files.
 *
 * Returns null on failure (caller skips the track).
 */
function decodeAudio(filePath) {
  try {
    const result = spawnSync(
      'ffmpeg',
      [
        '-i',      filePath,
        '-ac',     '1',               // force mono
        '-ar',     String(SAMPLE_RATE),
        '-f',      'f32le',           // raw 32-bit float little-endian PCM
        '-acodec', 'pcm_f32le',
        'pipe:1',                     // write to stdout
      ],
      {
        maxBuffer: 300 * 1024 * 1024, // 300 MB — enough for long orchestral tracks at 44100 Hz
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );

    if (result.status !== 0) {
      const stderr = result.stderr ? result.stderr.toString().slice(0, 300) : '(no stderr)';
      console.error(`  ffmpeg error (exit ${result.status}): ${stderr}`);
      return null;
    }

    if (!result.stdout || result.stdout.length === 0) {
      console.error(`  ffmpeg produced no output for: ${filePath}`);
      return null;
    }

    // result.stdout is a Node Buffer — reinterpret its bytes as float32
    const buf = result.stdout;
    return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);

  } catch (e) {
    console.error(`  Decode exception: ${e.message}`);
    return null;
  }
}

// ── Feature extraction ────────────────────────────────────────────────────────

/**
 * Extracts the 90-value feature vector from a single audio file.
 *
 * Frame loop: slides a BUFFER_SIZE window over the decoded samples with
 * HOP_LENGTH steps — identical to how featureExtraction.worker.ts processes
 * audio in the browser.
 *
 * Returns the feature vector object, or null if the track should be skipped.
 */
function extractFeatures(filePath) {
  const samples = decodeAudio(filePath);
  if (!samples) return null;

  // Near-silence check — mirrors Python: skip if global RMS < 0.001
  let sumSq = 0;
  for (let i = 0; i < samples.length; i++) sumSq += samples[i] * samples[i];
  const globalRMS = Math.sqrt(sumSq / samples.length);
  if (globalRMS < 0.001) {
    console.log(`  Skipping near-silent track: ${filePath}`);
    return null;
  }

  // Accumulators: one array per feature dimension across all frames
  const acc = {
    rms:              [],
    zcr:              [],
    spectralCentroid: [],
    spectralSpread:[],
    spectralFlatness: [],
    mfcc:  Array.from({ length: N_MFCC },   () => []),
    chroma:Array.from({ length: N_CHROMA }, () => []),
  };

  const totalFrames = Math.floor((samples.length - BUFFER_SIZE) / HOP_LENGTH) + 1;

  for (let frame = 0; frame < totalFrames; frame++) {
    const start  = frame * HOP_LENGTH;
    const signal = samples.slice(start, start + BUFFER_SIZE);

    // Meyda requires exactly BUFFER_SIZE samples — skip the last incomplete frame
    if (signal.length < BUFFER_SIZE) break;

    let feats;
    try {
      feats = Meyda.extract(MEYDA_FEATURES, signal, {
            sampleRate: SAMPLE_RATE,
            bufferSize: BUFFER_SIZE,
        });
    } catch {
      // Bad frame — skip silently. Rare, doesn't affect percentile estimates.
      continue;
    }

    if (!feats) continue;

    // Scalar features
    if (Number.isFinite(feats.rms))              acc.rms.push(feats.rms);
    if (Number.isFinite(feats.zcr))              acc.zcr.push(feats.zcr);
    if (Number.isFinite(feats.spectralCentroid)) acc.spectralCentroid.push(feats.spectralCentroid);
    if (Number.isFinite(feats.spectralSpread))   acc.spectralSpread.push(feats.spectralSpread);
    if (Number.isFinite(feats.spectralFlatness)) acc.spectralFlatness.push(feats.spectralFlatness); 

    // Vector features — push per-coefficient
    if (Array.isArray(feats.mfcc)) {
      feats.mfcc.forEach((v, i) => { if (v != null) acc.mfcc[i].push(v); });
    }
    if (Array.isArray(feats.chroma)) {
      feats.chroma.forEach((v, i) => { if (v != null) acc.chroma[i].push(v); });
    }
  }

  // Require a minimum number of frames — very short or corrupt files may produce
  // meaningless percentile estimates
  if (acc.rms.length < MIN_FRAMES) {
    console.log(`  Skipping — too few valid frames (${acc.rms.length}): ${filePath}`);
    return null;
  }

  // Build the feature vector — key names match Python output exactly
  const vector = {};

  vector.rms      = percentileSnapshot(acc.rms);
  vector.zcr      = percentileSnapshot(acc.zcr);
  vector.centroid = percentileSnapshot(acc.spectralCentroid);
  vector.spread   = percentileSnapshot(acc.spectralSpread);
  vector.flatness = percentileSnapshot(acc.spectralFlatness);

  // mfcc_1 … mfcc_13
  for (let i = 0; i < N_MFCC; i++) {
    vector[`mfcc_${i + 1}`] = percentileSnapshot(acc.mfcc[i]);
  }

  // chroma_1 … chroma_12
  for (let i = 0; i < N_CHROMA; i++) {
    vector[`chroma_${i + 1}`] = percentileSnapshot(acc.chroma[i]);
  }

  return vector;
}

// ── Path helpers ──────────────────────────────────────────────────────────────

/**
 * Normalises a file path to the ./data/... format used in the Python scripts.
 * Ensures file dedup against existing results works correctly.
 */
function normalisePath(p) {
  return p.replace(/\\/g, '/').replace(/^(?!\.\/)/, './');
}

/** Recursively walks a directory and returns all audio file paths. */
function walkAudioFiles(dir) {
  const supported = new Set(['.mp3', '.wav', '.flac', '.ogg']);
  const results   = [];

  function walk(current) {
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (e) {
      console.error(`  Cannot read directory ${current}: ${e.message}`);
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (supported.has(path.extname(entry.name).toLowerCase())) {
        results.push(normalisePath(full));
      }
    }
  }

  walk(dir);
  return results;
}

/**
 * Reads file paths from musopen_tracklist.md.
 * Skips blank lines and lines starting with # (comments / section headers).
 * Matches Python's load_tracklist() in extract_musopen_features.py.
 */
function loadTracklist(tracklistPath) {
  return fs.readFileSync(tracklistPath, 'utf8')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'));
}

/** Save results array to outputPath. */
function saveProgress(results, outputPath) {
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
}

// ── Musopen metadata parser ───────────────────────────────────────────────────

/**
 * Extracts composer / work / movement from the Musopen DVD folder structure.
 * Mirrors Python's parse_metadata() in extract_musopen_features.py exactly —
 * including the String Quartets nested folder special case.
 *
 * e.g. data/musopen/Musopen DVD/Brahms - Symphony No 3/Symphony No. 3 ... .mp3
 *   → { composer: "Brahms", work: "Symphony No 3", movement: "Symphony No. 3 ..." }
 */
function parseMusopenMetadata(filePath) {
  const parts = filePath.replace(/\\/g, '/').split('/');
  try {
    const folder   = parts[parts.length - 2];
    const movement = path.basename(filePath, path.extname(filePath));

    let composer, work;
    if (folder.includes(' - ')) {
      [composer, work] = folder.split(' - ', 2);
    } else {
      composer = 'Unknown';
      work     = folder;
    }

    // Nested String Quartets folder — matches Python logic
    const sqIdx = parts.indexOf('String Quartets');
    if (sqIdx !== -1 && parts.length > sqIdx + 2) {
      work     = parts[sqIdx + 1];
      composer = work.split(' ')[0];
    }

    return {
      composer: composer.trim(),
      work:     work.trim(),
      movement: movement.trim(),
    };
  } catch {
    return { composer: 'Unknown', work: 'Unknown', movement: 'Unknown' };
  }
}

// ── Preflight check ───────────────────────────────────────────────────────────

function checkDependencies() {
  // ffmpeg
  try {
    execSync('ffmpeg -version', { stdio: 'ignore' });
  } catch {
    console.error('ERROR: ffmpeg not found in PATH.');
    console.error('  macOS:  brew install ffmpeg');
    console.error('  Ubuntu: sudo apt install ffmpeg');
    process.exit(1);
  }

  // Meyda — already required at top; if it throws we won't reach here
  console.log(`Meyda version: ${require('meyda/package.json').version}`);
  console.log(`ffmpeg: OK`);
  console.log(`BUFFER_SIZE: ${BUFFER_SIZE} | HOP_LENGTH: ${HOP_LENGTH} | SAMPLE_RATE: ${SAMPLE_RATE}\n`);
}

// ── FMA mode ──────────────────────────────────────────────────────────────────

function runFMA(config) {
  const { audioDir, outputPath } = config;

  let results        = [];
  const processedFiles = new Set();

  // Resumable — reload existing output if present
  if (fs.existsSync(outputPath)) {
    results = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    results.forEach(r => processedFiles.add(r.file));
    console.log(`Resuming — ${results.length} tracks already processed.\n`);
  }

  const allFiles  = walkAudioFiles(audioDir);
  const remaining = allFiles.filter(f => !processedFiles.has(f));

  console.log(`Found ${allFiles.length} total files. ${remaining.length} left to process.\n`);

  for (let i = 0; i < remaining.length; i++) {
    const filePath = remaining[i];
    console.log(`[${i + 1}/${remaining.length}] Processing: ${filePath}`);

    const features = extractFeatures(filePath);
    if (features) {
      // Output shape: { file, features } — matches extract_features.py exactly.
      // curate_library.py will add track_id and genre when it reads this file.
      results.push({ file: filePath, features });
    }

    if ((i + 1) % SAVE_EVERY === 0) {
      saveProgress(results, outputPath);
      console.log(`  ✓ Progress saved (${results.length} tracks so far)`);
    }
  }

  saveProgress(results, outputPath);
  console.log(`\nDone. Extracted features from ${results.length} tracks.`);
  console.log(`Saved to ${outputPath}`);
}

// ── Musopen mode ──────────────────────────────────────────────────────────────

function runMusopen(config) {
  const { outputPath, tracklistPath } = config;

  let results         = [];
  const processedFiles = new Set();

  // Resumable
  if (fs.existsSync(outputPath)) {
    results = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    results.forEach(r => processedFiles.add(r.file));
    console.log(`Resuming — ${results.length} tracks already processed.\n`);
  }

  const tracklist = loadTracklist(tracklistPath);
  const remaining = tracklist.filter(f => !processedFiles.has(f));

  console.log(`Tracklist: ${tracklist.length} tracks. ${remaining.length} left to process.\n`);

  for (let i = 0; i < remaining.length; i++) {
    const filePath = remaining[i];
    console.log(`[${i + 1}/${remaining.length}] ${filePath}`);

    if (!fs.existsSync(filePath)) {
      console.log(`  ⚠️  File not found — skipping`);
      continue;
    }

    const features = extractFeatures(filePath);
    if (features) {
      const meta = parseMusopenMetadata(filePath);
      // Output shape: { file, genre, composer, work, movement, features }
      // Matches extract_musopen_features.py output — merge_library.py expects this shape.
      results.push({
        file:     filePath,
        genre:    'Classical',
        composer: meta.composer,
        work:     meta.work,
        movement: meta.movement,
        features,
      });
      console.log(`  ✓ ${meta.composer} — ${meta.movement}`);
    }

    if ((i + 1) % SAVE_EVERY === 0) {
      saveProgress(results, outputPath);
      console.log(`  ✓ Progress saved (${results.length} tracks so far)\n`);
    }
  }

  saveProgress(results, outputPath);
  console.log(`\nDone. Extracted features from ${results.length} tracks.`);
  console.log(`Saved to ${outputPath}`);

  // Composer summary — mirrors Python script output
  const composers = {};
  results.forEach(r => { composers[r.composer] = (composers[r.composer] || 0) + 1; });
  console.log('\nBreakdown by composer:');
  Object.entries(composers)
    .sort((a, b) => b[1] - a[1])
    .forEach(([c, n]) => console.log(`  ${c}: ${n}`));
}

// ── YouTube mode ──────────────────────────────────────────────────────────────
function runYouTube(config) {
  const { audioDir, outputPath } = config;
  let results        = [];
  const processedFiles = new Set();

  // Resumable
  if (fs.existsSync(outputPath)) {
    results = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    results.forEach(r => processedFiles.add(r.file));
    console.log(`Resuming — ${results.length} tracks already processed.\n`);
  }

  const allFiles  = walkAudioFiles(audioDir);
  const remaining = allFiles.filter(f => !processedFiles.has(f));
  console.log(`Found ${allFiles.length} total files. ${remaining.length} left to process.\n`);

  for (let i = 0; i < remaining.length; i++) {
    const filePath = remaining[i];
    console.log(`[${i + 1}/${remaining.length}] Processing: ${filePath}`);

    const features = extractFeatures(filePath);
    if (features) {
      results.push({
        file: filePath,
        genre: 'YouTube',
        features,
      });
    }

    if ((i + 1) % SAVE_EVERY === 0) {
      saveProgress(results, outputPath);
      console.log(`  ✓ Progress saved (${results.length} tracks so far)`);
    }
  }

  saveProgress(results, outputPath);
  console.log(`\nDone. Extracted features from ${results.length} tracks.`);
  console.log(`Saved to ${outputPath}`);
}

// ── Entry point ───────────────────────────────────────────────────────────────

const mode = process.argv[2];
if (!['fma', 'musopen', 'youtube'].includes(mode)) {
  console.error('\nUsage: node scripts/extract_features.js [fma|musopen|youtube]\n');
  console.error('  fma     — walks ./data/fma_small, writes scripts/feature_vectors.json');
  console.error('  musopen — reads scripts/musopen_tracklist.md, writes scripts/musopen_feature_vectors.json');
  console.error('  youtube — walks ./data/youtube, writes scripts/youtube_feature_vectors.json\n');
  process.exit(1);
}

console.log(`\n── SceneSync feature extractor (${mode.toUpperCase()}) ──────────────────────────\n`);
checkDependencies();

if (mode === 'fma') {
  runFMA(PATHS.fma);
} else if (mode === 'musopen') {
  runMusopen(PATHS.musopen);
} else {
  runYouTube(PATHS.youtube);
}