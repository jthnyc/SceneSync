"""
extract_musopen_features.py

Extracts feature vectors from the curated Musopen tracklist and saves
them to scripts/musopen_feature_vectors.json.

Uses the same extraction logic and parameters as extract_features.py
to ensure consistency with the FMA feature vectors.

Usage:
    python scripts/extract_musopen_features.py

Run from project root (SceneSync/).
"""

import os
import json
import numpy as np
import librosa

# ── Configuration ─────────────────────────────────────────────────────────────

TRACKLIST_PATH = "./scripts/musopen_tracklist.md"
OUTPUT_PATH    = "./scripts/musopen_feature_vectors.json"
SAMPLE_RATE    = 44100   # match Meyda's default
HOP_LENGTH     = 256     # match Meyda's default
N_FFT          = 2048    # match Meyda's buffer size (BUFFER_SIZE in browser)
N_MFCC         = 13
N_CHROMA       = 12
PERCENTILES    = [25, 50, 75]

# ── Feature extraction (identical to extract_features.py) ─────────────────────

def extract_features(file_path):
    try:
        y, sr = librosa.load(file_path, sr=SAMPLE_RATE, mono=True)
    except Exception as e:
        print(f"  Could not load {file_path}: {e}")
        return None

    if np.sqrt(np.mean(y**2)) < 0.001:
        print(f"  Skipping near-silent track: {file_path}")
        return None

    rms      = librosa.feature.rms(y=y, frame_length=N_FFT, hop_length=HOP_LENGTH)[0]
    zcr      = librosa.feature.zero_crossing_rate(y, frame_length=N_FFT, hop_length=HOP_LENGTH)[0]
    centroid = librosa.feature.spectral_centroid(y=y, sr=sr, n_fft=N_FFT, hop_length=HOP_LENGTH)[0]
    spread   = librosa.feature.spectral_bandwidth(y=y, sr=sr, n_fft=N_FFT, hop_length=HOP_LENGTH)[0]
    flatness = librosa.feature.spectral_flatness(y=y, n_fft=N_FFT, hop_length=HOP_LENGTH)[0]
    mfcc     = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=N_MFCC, n_fft=N_FFT, hop_length=HOP_LENGTH, n_mels=26, norm=None)
    chroma   = librosa.feature.chroma_stft(y=y, sr=sr, n_chroma=N_CHROMA, n_fft=N_FFT, hop_length=HOP_LENGTH)

    def percentile_snapshot(frames):
        return [float(np.percentile(frames, p)) for p in PERCENTILES]

    vector = {}
    vector["rms"]      = percentile_snapshot(rms)
    vector["zcr"]      = percentile_snapshot(zcr)
    vector["centroid"] = percentile_snapshot(centroid)
    vector["spread"]   = percentile_snapshot(spread)
    vector["flatness"] = percentile_snapshot(flatness)

    for i in range(N_MFCC):
        vector[f"mfcc_{i+1}"] = percentile_snapshot(mfcc[i])

    for i in range(N_CHROMA):
        vector[f"chroma_{i+1}"] = percentile_snapshot(chroma[i])

    return vector

# ── Parse metadata from file path ─────────────────────────────────────────────

def parse_metadata(file_path):
    """
    Extracts composer and work name from the Musopen DVD folder structure.
    e.g. data/musopen/Musopen DVD/Brahms - Symphony No 3/Symphony No. 3 ... .mp3
    → composer: "Brahms", work: "Symphony No 3"
    """
    parts = file_path.replace("\\", "/").split("/")
    # parts: [..., "Musopen DVD", "Brahms - Symphony No 3", "filename.mp3"]
    try:
        folder = parts[-2]  # e.g. "Brahms - Symphony No 3"
        filename = os.path.splitext(parts[-1])[0]  # movement name without .mp3

        if " - " in folder:
            composer, work = folder.split(" - ", 1)
        else:
            composer = "Unknown"
            work = folder

        # Handle nested String Quartets folder
        if "String Quartets" in parts:
            sq_idx = parts.index("String Quartets")
            if len(parts) > sq_idx + 2:
                work = parts[sq_idx + 1]  # e.g. "Borodin String Quartet No 2"
                composer_guess = work.split(" ")[0]
                composer = composer_guess

        return {
            "composer": composer.strip(),
            "work":     work.strip(),
            "movement": filename.strip(),
        }
    except Exception:
        return {"composer": "Unknown", "work": "Unknown", "movement": "Unknown"}

# ── Load tracklist ─────────────────────────────────────────────────────────────

def load_tracklist(path):
    """
    Reads file paths from the tracklist markdown file.
    Skips comment lines (# ...) and blank lines.
    """
    tracks = []
    with open(path, "r") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#"):
                tracks.append(line)
    return tracks

# ── Main ───────────────────────────────────────────────────────────────────────

def run():
    results = []
    processed_files = set()

    # Resumable — load existing output if present
    if os.path.exists(OUTPUT_PATH):
        with open(OUTPUT_PATH, "r") as f:
            results = json.load(f)
            processed_files = {r["file"] for r in results}
        print(f"Resuming — {len(results)} tracks already processed.\n")

    tracklist = load_tracklist(TRACKLIST_PATH)
    remaining = [t for t in tracklist if t not in processed_files]

    print(f"Tracklist: {len(tracklist)} tracks. {len(remaining)} left to process.\n")

    for i, path in enumerate(remaining):
        print(f"[{i+1}/{len(remaining)}] {path}")
        if not os.path.exists(path):
            print(f"  ⚠️  File not found — skipping")
            continue

        features = extract_features(path)
        if features is not None:
            meta = parse_metadata(path)
            results.append({
                "file":     path,
                "genre":    "Classical",
                "composer": meta["composer"],
                "work":     meta["work"],
                "movement": meta["movement"],
                "features": features,
            })
            print(f"  ✓ {meta['composer']} — {meta['movement']}")

        # Save progress every 10 tracks (smaller batch than FMA since list is short)
        if (i + 1) % 10 == 0:
            with open(OUTPUT_PATH, "w") as f:
                json.dump(results, f, indent=2)
            print(f"  ✓ Progress saved ({len(results)} tracks so far)\n")

    # Final save
    with open(OUTPUT_PATH, "w") as f:
        json.dump(results, f, indent=2)

    print(f"\nDone. Extracted features from {len(results)} tracks.")
    print(f"Saved to {OUTPUT_PATH}")

    # Summary
    composers = {}
    for r in results:
        c = r["composer"]
        composers[c] = composers.get(c, 0) + 1
    print("\nBreakdown by composer:")
    for c, n in sorted(composers.items(), key=lambda x: -x[1]):
        print(f"  {c}: {n}")

if __name__ == "__main__":
    run()