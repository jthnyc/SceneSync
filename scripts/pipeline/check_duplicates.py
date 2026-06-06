#!/usr/bin/env python
"""
check_duplicates.py
Compares filenames in a new batch folder against tracks already in
public/data/feature_vectors.json and flags duplicates before extraction.

Usage:
    python scripts/pipeline/check_duplicates.py data/youtube/batch4/

Run this after organizing your downloads and before running extraction.
"""

import sys
import os
import json

def main():
    if len(sys.argv) < 2:
        print("Usage: python scripts/pipeline/check_duplicates.py <batch_folder>")
        sys.exit(1)

    batch_folder = sys.argv[1].rstrip("/")

    if not os.path.isdir(batch_folder):
        print(f"Error: folder not found: {batch_folder}")
        sys.exit(1)

    # Load existing library
    library_path = "public/data/feature_vectors.json"
    if not os.path.exists(library_path):
        print(f"Error: library not found at {library_path}")
        print("Make sure you're running this from the project root.")
        sys.exit(1)

    with open(library_path) as f:
        library = json.load(f)

    # Build a set of existing filenames (basename only, no path)
    existing = set()
    for track in library:
        existing.add(os.path.basename(track["file"]))

    # Scan batch folder for MP3s
    batch_files = sorted([
        f for f in os.listdir(batch_folder)
        if f.lower().endswith(".mp3")
    ])

    if not batch_files:
        print(f"No MP3 files found in {batch_folder}")
        sys.exit(0)

    duplicates = [f for f in batch_files if f in existing]
    new_tracks = [f for f in batch_files if f not in existing]

    # Initial report
    print(f"\n{'='*50}")
    print(f"  Batch folder:     {batch_folder}/")
    print(f"  Tracks in folder: {len(batch_files)}")
    print(f"  Library size:     {len(library)} tracks")
    print(f"  Duplicates found: {len(duplicates)}")
    print(f"  New to add:       {len(new_tracks)}")
    print(f"{'='*50}\n")

    if not duplicates:
        print("No duplicates found. All tracks are new — ready to extract.")
    else:
        print(f"Duplicates already in library:")
        for f in duplicates:
            print(f"  ✗  {f}")
        print()
        print(f"New tracks ready for extraction:")
        for f in new_tracks:
            print(f"  ✓  {f}")
        print()

        response = input("Delete duplicates from batch folder now? [y/N] ").strip().lower()
        if response == "y":
            for f in duplicates:
                path = os.path.join(batch_folder, f)
                os.remove(path)
                print(f"  Deleted: {f}")
            print(f"\nDone. {len(new_tracks)} tracks remain in {batch_folder}/ — ready to extract.")
        else:
            print("No files deleted. Remove duplicates manually before extracting.")

    print()

if __name__ == "__main__":
    main()