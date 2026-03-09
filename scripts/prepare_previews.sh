#!/bin/bash
# prepare_previews.sh
# Creates a preview directory with:
#   - Musopen tracks trimmed to 90 seconds
#   - FMA tracks copied as-is (already ~30s)
#
# Run from SceneSync project root:
#   chmod +x scripts/prepare_previews.sh
#   ./scripts/prepare_previews.sh
#
# Requires: ffmpeg (brew install ffmpeg)
# Output: data/previews/ (mirrors source directory structure)

# set -e  # Disabled: we want to continue when individual files fail

PREVIEW_DIR="data/previews"
MUSOPEN_DIR="data/musopen/Musopen DVD"
FMA_DIR="data/fma_small"
TRIM_DURATION=90

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "============================================"
echo "  SceneSync — Preview Generator"
echo "============================================"
echo ""

# Check ffmpeg
if ! command -v ffmpeg &> /dev/null; then
    echo -e "${RED}ERROR: ffmpeg not found. Install with: brew install ffmpeg${NC}"
    exit 1
fi

# Create output directory
mkdir -p "$PREVIEW_DIR"

# --- Musopen: trim to 90 seconds ---
echo -e "${YELLOW}--- Musopen tracks (trimming to ${TRIM_DURATION}s) ---${NC}"
echo ""

musopen_count=0
musopen_skipped=0

# Use find to handle the em-dash and special characters in folder names
find "$MUSOPEN_DIR" -name "*.mp3" -type f -print0 | while IFS= read -r -d '' src; do
    # Build the output path: data/previews/musopen/Musopen DVD/...
    # Strip the leading "data/musopen/" to get relative path
    rel_path="${src#data/musopen/}"
    dest="$PREVIEW_DIR/musopen/$rel_path"
    dest_dir="$(dirname "$dest")"

    # Skip if already processed
    if [ -f "$dest" ]; then
        musopen_skipped=$((musopen_skipped + 1))
        continue
    fi

    mkdir -p "$dest_dir"

    # Trim to 90 seconds, re-encode to consistent bitrate
    # -y: overwrite, -t: duration, -c:a libmp3lame: re-encode mp3, -q:a 2: ~190kbps VBR
    if ffmpeg -y -i "$src" -t "$TRIM_DURATION" -c:a libmp3lame -q:a 2 "$dest" -loglevel warning 2>&1; then
        # Get durations for logging
        src_dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$src" 2>/dev/null | cut -d'.' -f1)
        dest_dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$dest" 2>/dev/null | cut -d'.' -f1)
        echo -e "  ${GREEN}✓${NC} $(basename "$src") (${src_dur}s → ${dest_dur}s)"
    else
        echo -e "  ${RED}✗${NC} FAILED: $(basename "$src")"
    fi
done

echo ""

# --- FMA: copy as-is (already ~30s clips) ---
echo -e "${YELLOW}--- FMA tracks (copying as-is) ---${NC}"
echo ""

# Read curated track IDs from feature_vectors.json
# Extract FMA file paths and copy only those tracks
python3 -c "
import json, shutil, os

with open('public/data/feature_vectors.json') as f:
    tracks = json.load(f)

fma_tracks = [t for t in tracks if 'fma_small' in t.get('file', '')]
copied = 0
skipped = 0

for t in fma_tracks:
    # file looks like: ./data/fma_small/141/141300.mp3
    src = t['file'].lstrip('./')
    # dest: data/previews/fma_small/141/141300.mp3
    rel_path = src.replace('data/fma_small/', '')
    dest = os.path.join('data/previews/fma_small', rel_path)

    if os.path.exists(dest):
        skipped += 1
        continue

    os.makedirs(os.path.dirname(dest), exist_ok=True)

    if os.path.exists(src):
        shutil.copy2(src, dest)
        copied += 1
    else:
        print(f'  ✗ NOT FOUND: {src}')

print(f'  ✓ Copied {copied} FMA tracks ({skipped} already existed)')
"

echo ""

# --- Summary ---
echo "============================================"
echo "  Summary"
echo "============================================"

musopen_total=$(find "$PREVIEW_DIR/musopen" -name "*.mp3" -type f 2>/dev/null | wc -l | tr -d ' ')
fma_total=$(find "$PREVIEW_DIR/fma_small" -name "*.mp3" -type f 2>/dev/null | wc -l | tr -d ' ')
total_size=$(du -sh "$PREVIEW_DIR" 2>/dev/null | cut -f1)

echo ""
echo "  Musopen previews: $musopen_total"
echo "  FMA tracks:       $fma_total"
echo "  Total size:       $total_size"
echo "  Output:           $PREVIEW_DIR/"
echo ""
echo "  Next step: upload $PREVIEW_DIR/ to Cloudflare R2"
echo ""