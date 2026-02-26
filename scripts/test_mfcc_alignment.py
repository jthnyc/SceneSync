"""
test_mfcc_alignment.py

Compares raw frame-level MFCC values between librosa and what Meyda
would produce for the same audio file. Used to identify the exact
DCT convention difference before applying a correction.

Usage:
    python scripts/test_mfcc_alignment.py path/to/test_track.mp3

Pick a short track (30s is enough). Use the same track in the browser
diagnostic to compare Meyda output side by side.

Run from project root (SceneSync/).
"""

import sys
import numpy as np
import librosa

SAMPLE_RATE = 44100
N_FFT       = 512
HOP_LENGTH  = 256
N_MFCC      = 13

def run(file_path):
    print(f"Loading: {file_path}")
    y, sr = librosa.load(file_path, sr=SAMPLE_RATE, mono=True, duration=30)

    print("\n── Default librosa (current extraction params) ──")
    mfcc_default = librosa.feature.mfcc(
        y=y, sr=sr, n_mfcc=N_MFCC, n_fft=N_FFT, hop_length=HOP_LENGTH
    )
    for i in range(3):  # first 3 coefficients
        frames = mfcc_default[i]
        print(f"  mfcc_{i+1}: mean={frames.mean():.2f}, std={frames.std():.2f}, "
              f"p25={np.percentile(frames,25):.2f}, p50={np.percentile(frames,50):.2f}, "
              f"p75={np.percentile(frames,75):.2f}")

    print("\n── n_mels=26, norm=None (attempted fix) ──")
    mfcc_fix1 = librosa.feature.mfcc(
        y=y, sr=sr, n_mfcc=N_MFCC, n_fft=N_FFT, hop_length=HOP_LENGTH,
        n_mels=26, norm=None
    )
    for i in range(3):
        frames = mfcc_fix1[i]
        print(f"  mfcc_{i+1}: mean={frames.mean():.2f}, std={frames.std():.2f}, "
              f"p25={np.percentile(frames,25):.2f}, p50={np.percentile(frames,50):.2f}, "
              f"p75={np.percentile(frames,75):.2f}")

    print("\n── Raw frame values (first 5 frames), mfcc_1 only ──")
    print(f"  default: {mfcc_default[0][:5].tolist()}")
    print(f"  fix1:    {mfcc_fix1[0][:5].tolist()}")

    print("\n── Next step ──")
    print("Drop the same file in the browser and log featureVector.mfcc_1")
    print("Compare the p25/p50/p75 values above against the browser output")
    print("The relationship between them tells you what correction to apply")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python scripts/test_mfcc_alignment.py path/to/track.mp3")
        sys.exit(1)
    run(sys.argv[1])