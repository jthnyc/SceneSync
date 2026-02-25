import os
import json
import numpy as np
import librosa
import pandas as pd

# ── Configuration ────────────────────────────────────────────────────────────

AUDIO_DIR = "./data/fma_small"   # path to your unzipped FMA small folder
OUTPUT_PATH = "./scripts/feature_vectors.json"
SAMPLE_RATE = 44100              # match Meyda's default
HOP_LENGTH = 256                 # match Meyda's default
N_FFT = 512                      # match Meyda's buffer size
N_MFCC = 13
N_CHROMA = 12
PERCENTILES = [25, 50, 75]

# ── Feature extraction for a single file ─────────────────────────────────────

def extract_features(file_path):
    try:
        y, sr = librosa.load(file_path, sr=SAMPLE_RATE, mono=True)
    except Exception as e:
        print(f"  Could not load {file_path}: {e}")
        return None

    # Skip near-silent tracks
    if np.sqrt(np.mean(y**2)) < 0.001:
        print(f"  Skipping near-silent track: {file_path}")
        return None

    # Compute frame-level features
    rms         = librosa.feature.rms(y=y, frame_length=N_FFT, hop_length=HOP_LENGTH)[0]
    zcr         = librosa.feature.zero_crossing_rate(y, frame_length=N_FFT, hop_length=HOP_LENGTH)[0]
    centroid    = librosa.feature.spectral_centroid(y=y, sr=sr, n_fft=N_FFT, hop_length=HOP_LENGTH)[0]
    spread      = librosa.feature.spectral_bandwidth(y=y, sr=sr, n_fft=N_FFT, hop_length=HOP_LENGTH)[0]
    flatness    = librosa.feature.spectral_flatness(y=y, n_fft=N_FFT, hop_length=HOP_LENGTH)[0]
    mfcc        = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=N_MFCC, n_fft=N_FFT, hop_length=HOP_LENGTH, n_mels=26, norm=None)
    chroma      = librosa.feature.chroma_stft(y=y, sr=sr, n_chroma=N_CHROMA, n_fft=N_FFT, hop_length=HOP_LENGTH)

    # Build percentile snapshots for each feature
    def percentile_snapshot(frames):
        return [float(np.percentile(frames, p)) for p in PERCENTILES]

    vector = {}

    vector["rms"]      = percentile_snapshot(rms)
    vector["zcr"]      = percentile_snapshot(zcr)
    vector["centroid"] = percentile_snapshot(centroid)
    vector["spread"]   = percentile_snapshot(spread)
    vector["flatness"] = percentile_snapshot(flatness)

    # MFCCs: percentile snapshot per coefficient
    for i in range(N_MFCC):
        vector[f"mfcc_{i+1}"] = percentile_snapshot(mfcc[i])

    # Chroma: percentile snapshot per pitch class
    for i in range(N_CHROMA):
        vector[f"chroma_{i+1}"] = percentile_snapshot(chroma[i])

    return vector

# ── Walk the audio directory and process files ────────────────────────────────

def run():
    results = []
    processed_files = set()
    supported = (".mp3", ".wav", ".flac", ".ogg")

    # Load existing results if output file already exists (resumable)
    if os.path.exists(OUTPUT_PATH):
        with open(OUTPUT_PATH, "r") as f:
            results = json.load(f)
            processed_files = {r["file"] for r in results}
        print(f"Resuming — {len(results)} tracks already processed.\n")

    audio_files = []
    for root, _, files in os.walk(AUDIO_DIR):
        for fname in files:
            if fname.lower().endswith(supported):
                audio_files.append(os.path.join(root, fname))

    remaining = [f for f in audio_files if f not in processed_files]
    print(f"Found {len(audio_files)} total files. {len(remaining)} left to process.\n")

    for i, path in enumerate(remaining):
        print(f"[{i+1}/{len(remaining)}] Processing: {path}")
        features = extract_features(path)
        if features is not None:
            results.append({
                "file": path,
                "features": features
            })

        # Save progress every 50 tracks
        if (i + 1) % 50 == 0:
            with open(OUTPUT_PATH, "w") as f:
                json.dump(results, f, indent=2)
            print(f"  ✓ Progress saved ({len(results)} tracks so far)")

    # Final save
    with open(OUTPUT_PATH, "w") as f:
        json.dump(results, f, indent=2)

    print(f"\nDone. Extracted features from {len(results)} tracks.")
    print(f"Saved to {OUTPUT_PATH}")

if __name__ == "__main__":
    run()