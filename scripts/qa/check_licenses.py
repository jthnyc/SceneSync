"""
License check for curated FMA tracks.
Run from SceneSync project root with conda scenesync environment:
    python scripts/check_licenses.py

Reads:
  - public/data/feature_vectors.json (to get curated FMA track IDs)
  - data/fma_metadata/tracks.csv (to look up license info)

Outputs: summary of license types across your curated FMA tracks.
"""

import json
import pandas as pd
from pathlib import Path

# --- Load curated track IDs from feature_vectors.json ---
fv_path = Path("public/data/feature_vectors.json")
if not fv_path.exists():
    print(f"ERROR: {fv_path} not found. Run from project root.")
    exit(1)

with open(fv_path) as f:
    tracks = json.load(f)

# Filter to FMA tracks only (Musopen tracks have different file paths)
fma_tracks = [t for t in tracks if "fma_small" in t.get("file", "")]
musopen_tracks = [t for t in tracks if "fma_small" not in t.get("file", "")]
fma_ids = [t["track_id"] for t in fma_tracks]

print(f"Total tracks in library: {len(tracks)}")
print(f"  FMA tracks: {len(fma_tracks)}")
print(f"  Musopen tracks: {len(musopen_tracks)} (CC0 — no license concerns)")
print()

# --- Load FMA metadata ---
# tracks.csv has a multi-level header (2 rows). 
# The license info is under ('track', 'license_url') or similar.
tracks_csv_path = Path("data/fma_metadata/tracks.csv")
if not tracks_csv_path.exists():
    print(f"ERROR: {tracks_csv_path} not found.")
    print("Make sure fma_metadata is in data/ directory.")
    exit(1)

# FMA tracks.csv uses a 2-row multi-index header
df = pd.read_csv(tracks_csv_path, index_col=0, header=[0, 1])

# Find license-related columns
license_cols = [col for col in df.columns if "license" in col[1].lower()]
print(f"License columns found in tracks.csv: {license_cols}")
print()

# --- Cross-reference ---
# Filter to our curated track IDs
curated = df.loc[df.index.isin(fma_ids)]
missing = set(fma_ids) - set(curated.index)

if missing:
    print(f"WARNING: {len(missing)} track IDs not found in tracks.csv: {missing}")
    print()

# Show license distribution
for col in license_cols:
    print(f"--- {col[0]}.{col[1]} ---")
    counts = curated[col].value_counts(dropna=False)
    for val, count in counts.items():
        print(f"  {val}: {count}")
    print()

# Flag any potentially restrictive licenses
print("=== SUMMARY ===")
print(f"Curated FMA tracks found: {len(curated)} / {len(fma_ids)}")
print()

# Check for ND (NoDerivatives) licenses — these could restrict streaming
for col in license_cols:
    nd_tracks = curated[curated[col].str.contains("nd", case=False, na=False)]
    if len(nd_tracks) > 0:
        print(f"⚠️  {len(nd_tracks)} tracks with NoDerivatives license ({col[1]}):")
        for tid in nd_tracks.index[:10]:
            print(f"    Track {tid}: {nd_tracks.loc[tid, col]}")
        if len(nd_tracks) > 10:
            print(f"    ... and {len(nd_tracks) - 10} more")
        print()

    nc_tracks = curated[curated[col].str.contains("nc", case=False, na=False)]
    if len(nc_tracks) > 0:
        print(f"ℹ️  {len(nc_tracks)} tracks with NonCommercial license ({col[1]}):")
        print(f"    (Fine for portfolio/non-commercial use, just noting it)")
        print()

    by_tracks = curated[curated[col].str.contains("by", case=False, na=False)]
    if len(by_tracks) > 0:
        print(f"ℹ️  {len(by_tracks)} tracks require Attribution ({col[1]}):")
        print(f"    (Need to credit artist name — you likely have this in metadata)")
        print()

print("Done. Review any ⚠️ warnings above before proceeding with hosting.")
