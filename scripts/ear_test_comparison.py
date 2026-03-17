"""
Cross-Source Similarity Gap Investigation — Step 3
===================================================
Side-by-side ranking comparison for ear-testing

For a curated set of reference tracks, shows top-10 results under:
  - BASELINE (current behavior)
  - PROPOSED (DROP_LOUD_DW_COARSE: drop RMS + MFCC1, half-weight MFCC 2-3 + chroma)

Outputs readable track identifications so you can listen and judge whether
the proposed rankings feel more musically honest.

Also computes a "rank movement" summary: which Musopen tracks gained the most
from the new scheme, and which FMA tracks lost the most.

Usage:
    python ear_test_comparison.py <feature_vectors.json>
"""

import json
import sys
import numpy as np
from collections import defaultdict

# ── Load & setup (same as Step 2) ─────────────────────────────────────────

if len(sys.argv) < 2:
    print("Usage: python ear_test_comparison.py <feature_vectors.json>")
    sys.exit(1)

with open(sys.argv[1], "r") as f:
    library = json.load(f)

FEATURE_ORDER = [
    "rms", "zcr", "centroid", "spread", "flatness",
    "mfcc_1", "mfcc_2", "mfcc_3", "mfcc_4", "mfcc_5",
    "mfcc_6", "mfcc_7", "mfcc_8", "mfcc_9", "mfcc_10",
    "mfcc_11", "mfcc_12", "mfcc_13",
    "chroma_1", "chroma_2", "chroma_3", "chroma_4",
    "chroma_5", "chroma_6", "chroma_7", "chroma_8",
    "chroma_9", "chroma_10", "chroma_11", "chroma_12",
]

def flatten(features):
    values = []
    for key in FEATURE_ORDER:
        for v in features[key]:
            values.append(float(v) if v is not None else 0.0)
    return values

def get_source(track):
    path = track.get("file", "")
    return "Musopen" if "musopen" in path else "FMA"

def get_track_label(track):
    """Human-readable label for a track."""
    source = get_source(track)
    if source == "Musopen":
        composer = track.get("composer", "Unknown")
        work = track.get("work", "")
        movement = track.get("movement", "")
        # Use movement if short enough, otherwise work
        label = movement if len(movement) < 60 else work
        return f"[Musopen] {composer}: {label}"
    else:
        genre = track.get("genre", "?")
        track_id = track.get("track_id", "?")
        filename = track["file"].split("/")[-1]
        return f"[FMA/{genre}] {filename} (id:{track_id})"

def get_dim_indices(feature_name):
    labels = []
    for key in FEATURE_ORDER:
        for p in ["p25", "p50", "p75"]:
            labels.append(f"{key}_{p}")
    return [i for i, l in enumerate(labels) if l.startswith(feature_name + "_p")]

def get_group_indices(feature_names):
    indices = []
    for name in feature_names:
        indices.extend(get_dim_indices(name))
    return indices

# ── Build normalized matrix ───────────────────────────────────────────────

sources = [get_source(t) for t in library]
raw_matrix = np.array([flatten(t["features"]) for t in library])
means = np.nanmean(raw_matrix, axis=0)
stds = np.nanstd(raw_matrix, axis=0)
EPS = 1e-8
norm_matrix = np.where(stds < EPS, 0, (raw_matrix - means) / (stds + EPS))

# ── Weight schemes ────────────────────────────────────────────────────────

def baseline_weights():
    return np.ones(90)

def proposed_weights():
    """DROP_LOUD_DW_COARSE: drop RMS + MFCC1, half-weight MFCC 2-3 + all chroma."""
    w = np.ones(90)
    w[get_group_indices(["rms"])] = 0
    w[get_group_indices(["mfcc_1"])] = 0
    w[get_group_indices(["mfcc_2", "mfcc_3"])] = 0.5
    w[get_group_indices([f"chroma_{i}" for i in range(1, 13)])] = 0.5
    return w

def weighted_cosine(a, b, weights):
    wa = a * weights
    wb = b * weights
    dot = np.dot(wa, wb)
    mag = np.sqrt(np.dot(wa, wa)) * np.sqrt(np.dot(wb, wb))
    return dot / mag if mag > 0 else 0

def rank_all(ref_idx, weights):
    """Return sorted list of (library_index, score) for all tracks except ref."""
    ref_vec = norm_matrix[ref_idx]
    scores = []
    for j in range(len(library)):
        if j == ref_idx:
            continue
        sim = weighted_cosine(ref_vec, norm_matrix[j], weights)
        scores.append((j, sim))
    scores.sort(key=lambda x: x[1], reverse=True)
    return scores

# ── Select ear-test references ────────────────────────────────────────────
# Hand-pick references that are most likely to have cross-source relevance:
# - Instrumental FMA tracks (closest genre to classical)
# - A folk track (acoustic, may share qualities with orchestral)
# - An electronic track (very different — tests whether we break anything)

fma_by_genre = defaultdict(list)
for i, track in enumerate(library):
    if sources[i] == "FMA":
        fma_by_genre[track.get("genre", "Unknown")].append(i)

# Also select a few Musopen references to test the reverse direction
musopen_indices = [i for i, s in enumerate(sources) if s == "Musopen"]

np.random.seed(42)

test_cases = []

# 3 Instrumental FMA tracks
for idx in np.random.choice(fma_by_genre["Instrumental"], 3, replace=False):
    test_cases.append(("FMA→all", idx))

# 1 Folk track
if fma_by_genre["Folk"]:
    test_cases.append(("FMA→all", np.random.choice(fma_by_genre["Folk"])))

# 1 Electronic track  
if fma_by_genre["Electronic"]:
    test_cases.append(("FMA→all", np.random.choice(fma_by_genre["Electronic"])))

# 3 Musopen tracks (reverse test: does a classical reference find similar FMA tracks?)
for idx in np.random.choice(musopen_indices, 3, replace=False):
    test_cases.append(("Musopen→all", idx))

# ── Run comparisons ───────────────────────────────────────────────────────

TOP_N = 10
bw = baseline_weights()
pw = proposed_weights()

print("=" * 110)
print("STEP 3: SIDE-BY-SIDE RANKING COMPARISON FOR EAR TESTING")
print("=" * 110)
print()
print("Scheme: DROP_LOUD_DW_COARSE")
print("  → Drop: RMS (3 dims), MFCC 1 (3 dims)")
print("  → Half-weight: MFCC 2-3 (6 dims), Chroma 1-12 (36 dims)")
print("  → Full weight: ZCR, Centroid, Spread, Flatness, MFCCs 4-13")
print()

all_movements = []  # Track rank movements for summary

for case_type, ref_idx in test_cases:
    ref_label = get_track_label(library[ref_idx])
    
    baseline_ranked = rank_all(ref_idx, bw)
    proposed_ranked = rank_all(ref_idx, pw)
    
    # Build rank lookup for proposed scheme
    proposed_rank_of = {idx: rank for rank, (idx, _) in enumerate(proposed_ranked)}
    baseline_rank_of = {idx: rank for rank, (idx, _) in enumerate(baseline_ranked)}
    
    print("─" * 110)
    print(f"  REFERENCE: {ref_label}")
    print(f"  Direction: {case_type}")
    print("─" * 110)
    
    # Show baseline top 10
    print(f"\n  {'BASELINE (current)':^52}  │  {'PROPOSED (new weights)':^52}")
    print(f"  {'─' * 52}  │  {'─' * 52}")
    
    for rank in range(TOP_N):
        # Baseline side
        b_idx, b_score = baseline_ranked[rank]
        b_label = get_track_label(library[b_idx])
        b_source = sources[b_idx]
        # Where does this track rank in proposed?
        p_rank_of_b = proposed_rank_of.get(b_idx, -1)
        
        # Proposed side
        p_idx, p_score = proposed_ranked[rank]
        p_label = get_track_label(library[p_idx])
        p_source = sources[p_idx]
        # Where does this track rank in baseline?
        b_rank_of_p = baseline_rank_of.get(p_idx, -1)
        
        # Markers
        b_marker = "★" if b_source == "Musopen" else " "
        p_marker = "★" if p_source == "Musopen" else " "
        
        # Movement indicator for proposed side
        if b_rank_of_p > rank:
            move = f"↑{b_rank_of_p - rank}"
        elif b_rank_of_p < rank:
            move = f"↓{rank - b_rank_of_p}"
        else:
            move = "="
        
        # Truncate labels for display
        b_short = b_label[:45] + "…" if len(b_label) > 46 else b_label
        p_short = p_label[:42] + "…" if len(p_label) > 43 else p_label
        
        print(f"  {rank+1:>2}.{b_marker}{b_score:.3f} {b_short:<46}  │  {rank+1:>2}.{p_marker}{p_score:.3f} {p_short:<43} {move}")
    
    # Count Musopen in top 10 for each
    b_mus_count = sum(1 for idx, _ in baseline_ranked[:TOP_N] if sources[idx] == "Musopen")
    p_mus_count = sum(1 for idx, _ in proposed_ranked[:TOP_N] if sources[idx] == "Musopen")
    
    print(f"\n  Musopen in top {TOP_N}: baseline={b_mus_count}, proposed={p_mus_count}")
    
    # Track biggest Musopen movements for this reference
    for idx in musopen_indices:
        b_rank = baseline_rank_of.get(idx, 999)
        p_rank = proposed_rank_of.get(idx, 999)
        movement = b_rank - p_rank  # positive = improved
        if abs(movement) > 10:
            all_movements.append({
                "ref": ref_label[:50],
                "track": get_track_label(library[idx])[:50],
                "baseline_rank": b_rank + 1,
                "proposed_rank": p_rank + 1,
                "movement": movement,
            })
    
    print()

# ── Biggest movers summary ────────────────────────────────────────────────

print("\n" + "=" * 110)
print("BIGGEST MUSOPEN RANK MOVEMENTS (|movement| > 10 ranks)")
print("=" * 110)

all_movements.sort(key=lambda x: x["movement"], reverse=True)

print(f"\n  {'Reference':<50} {'Musopen Track':<50} {'Base→Prop':>10} {'Δ':>5}")
print("  " + "─" * 117)

for m in all_movements[:20]:
    direction = f"↑{m['movement']}" if m["movement"] > 0 else f"↓{-m['movement']}"
    print(f"  {m['ref']:<50} {m['track']:<50} {m['baseline_rank']:>3}→{m['proposed_rank']:<3}    {direction:>5}")

if len(all_movements) > 20:
    print(f"\n  ... and {len(all_movements) - 20} more movements > 10 ranks")

# ── What to listen for ────────────────────────────────────────────────────

print("\n\n" + "=" * 110)
print("LISTENING GUIDE")
print("=" * 110)
print("""
When evaluating these rankings, listen for:

  1. TIMBRAL SIMILARITY — Do the instruments/sounds in the match actually 
     resemble the reference? A string quartet matching with an acoustic folk 
     track should feel right if the timbral texture is similar.

  2. ENERGY CONTOUR — Does the match have similar dynamic arc? Quiet passages, 
     builds, sustained energy? This is different from absolute loudness.

  3. SPECTRAL CHARACTER — Bright vs warm, thin vs full. Two tracks can be at 
     very different volumes but share the same spectral character.

  4. FALSE POSITIVES — Does the proposed scheme surface any matches that feel 
     completely wrong? That would mean we've removed too much signal.

  5. BURIED GEMS — In the baseline, are there Musopen tracks below rank 10 
     that the proposed scheme brings up, and do they actually sound similar?

The key question: when a Musopen track moves up in the proposed rankings, 
does it *deserve* to be there musically? Your ear is the ground truth.

To listen: all tracks stream from Cloudflare R2 in the app. Match file paths 
to the library entries to identify which tracks to A/B compare.
""")

# ── Append to INVESTIGATION_NOTES.md ─────────────────────────────────────

notes_path = "/home/claude/INVESTIGATION_NOTES.md"
with open(notes_path, "r") as f:
    existing = f.read()

step3_content = "\n## Step 3: Ear-Test Ranking Comparison\n\n"
step3_content += "**Proposed scheme:** DROP_LOUD_DW_COARSE\n"
step3_content += "- Drop: RMS (3 dims), MFCC 1 (3 dims)\n"
step3_content += "- Half-weight: MFCC 2-3 (6 dims), Chroma 1-12 (36 dims)\n"
step3_content += "- Full weight: ZCR, Centroid, Spread, Flatness, MFCCs 4-13\n\n"
step3_content += f"**Test set:** {len(test_cases)} reference tracks ({sum(1 for t, _ in test_cases if t.startswith('FMA'))} FMA, {sum(1 for t, _ in test_cases if t.startswith('Mus'))} Musopen)\n\n"
step3_content += "### Ear-Test Results\n\n"
step3_content += "_To be filled after listening. For each test case, note:_\n"
step3_content += "- _Did the proposed top-10 feel more musically relevant?_\n"
step3_content += "- _Did any new Musopen matches sound right? Sound wrong?_\n"
step3_content += "- _Did any FMA matches that dropped out still belong in the top 10?_\n\n"
step3_content += "### Observations\n\n"
step3_content += "_Pending listening session._\n"

updated = existing.replace(
    "## Step 3: Test Modified Similarity\n\n_Pending._",
    step3_content
)

with open(notes_path, "w") as f:
    f.write(updated)

# Also copy updated notes
import shutil
shutil.copy(notes_path, "/mnt/user-data/outputs/INVESTIGATION_NOTES.md")

print("✅ INVESTIGATION_NOTES.md updated with Step 3 framework")