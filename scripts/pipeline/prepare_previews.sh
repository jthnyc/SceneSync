#!/bin/bash
# prepare_previews.sh
# Creates a preview directory with:
#   - Musopen tracks trimmed to 90 seconds
#   - FMA tracks copied as-is (already ~30s)
#   - YouTube tracks trimmed to 90 seconds
#
# Run from SceneSync project root:
#   chmod +x scripts/prepare_previews.sh
#   ./scripts/prepare_previews.sh
#
# Requires: ffmpeg (brew install ffmpeg)
# Output: data/previews/ (mirrors source directory structure)

# No set -e: we want to continue when individual files fail.
# pipefail still catches broken pipes; -u catches unset variables.
set -uo pipefail

PREVIEW_DIR="data/previews"
TRIM_DURATION=90

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo "============================================"
echo "  SceneSync — Preview Generator"
echo "============================================"
echo ""

if ! command -v ffmpeg &> /dev/null; then
    echo -e "${RED}ERROR: ffmpeg not found. Install with: brew install ffmpeg${NC}"
    exit 1
fi

mkdir -p "$PREVIEW_DIR"

# Shared trim function — used by Musopen and YouTube sections.
# Returns 0 even on failure so the calling loop continues.
trim_file() {
    local src="$1"
    local dest="$2"

    # Skip if already processed
    if [ -f "$dest" ]; then
        return 0
    fi

    mkdir -p "$(dirname "$dest")"

    # CRITICAL: < /dev/null prevents ffmpeg from reading stdin.
    # Without it, ffmpeg inside a while-read pipe loop consumes bytes
    # from the pipe, eating the next filename and causing every-other failures.
    if ffmpeg -y -i "$src" -t "$TRIM_DURATION" -vn -c:a libmp3lame -q:a 2 "$dest" -loglevel error < /dev/null 2>/dev/null; then
        echo -e "  ${GREEN}✓${NC} $(basename "$src")"
    else
        echo -e "  ${RED}✗${NC} FAILED: $(basename "$src")"
    fi

    return 0
}

# --- Musopen: trim to 90 seconds ---
echo -e "${YELLOW}--- Musopen tracks (trimming to ${TRIM_DURATION}s) ---${NC}"
echo ""
musopen_src="data/musopen"
musopen_dest="data/previews/musopen"
if [ -d "$musopen_src" ]; then
    find "$musopen_src" -name "*.mp3" -type f -print0 | while IFS= read -r -d '' src; do
        rel="${src#data/musopen/}"
        dest="$musopen_dest/$rel"
        trim_file "$src" "$dest"
    done
else
    echo -e "  ${YELLOW}⚠ Musopen directory not found, skipping.${NC}"
fi
echo ""

# --- YouTube: trim to 90 seconds ---
echo -e "${YELLOW}--- YouTube tracks (trimming to ${TRIM_DURATION}s) ---${NC}"
echo ""
youtube_src="data/youtube"
youtube_dest="data/previews/youtube"
if [ -d "$youtube_src" ]; then
    find "$youtube_src" -name "*.mp3" -type f -print0 | while IFS= read -r -d '' src; do
        rel="${src#data/youtube/}"
        dest="$youtube_dest/$rel"
        trim_file "$src" "$dest"
    done
else
    echo -e "  ${YELLOW}⚠ YouTube directory not found, skipping.${NC}"
fi
echo ""

# --- FMA: copy as-is (already ~30s clips) ---
echo -e "${YELLOW}--- FMA tracks (copying as-is) ---${NC}"
echo ""
python3 -c "
import json, shutil, os

with open('public/data/feature_vectors.json') as f:
    tracks = json.load(f)

fma_tracks = [t for t in tracks if 'fma_small' in t.get('file', '')]
copied = 0
skipped = 0

for t in fma_tracks:
    src = t['file'].lstrip('./')
    rel = src.replace('data/fma_small/', '')
    dest = os.path.join('data/previews/fma_small', rel)

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
youtube_total=$(find "$PREVIEW_DIR/youtube" -name "*.mp3" -type f 2>/dev/null | wc -l | tr -d ' ')
total_size=$(du -sh "$PREVIEW_DIR" 2>/dev/null | cut -f1)

echo ""
echo "  Musopen previews: $musopen_total"
echo "  FMA tracks:       $fma_total"
echo "  YouTube tracks:   $youtube_total"
echo "  Total size:       $total_size"
echo "  Output:           $PREVIEW_DIR/"
echo ""
echo "  Next step: upload $PREVIEW_DIR/ to Cloudflare R2"
echo ""