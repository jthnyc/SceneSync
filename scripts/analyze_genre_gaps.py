# scripts/analyze_genre_gaps.py
import json
import numpy as np
from collections import Counter
import os
import sys

# Load your feature vectors
print("Loading feature vectors...")
with open('public/data/feature_vectors.json', 'r') as f:
    tracks = json.load(f)

print(f"\n📊 Total tracks: {len(tracks)}")
print("=" * 60)

# 1. Genre Distribution
print("\n🎵 GENRE DISTRIBUTION")
print("-" * 40)

genres = [t.get('genre', 'Unknown') for t in tracks if 'genre' in t]
genre_counts = Counter(genres)

for genre, count in sorted(genre_counts.items(), key=lambda x: x[1], reverse=True):
    percentage = (count / len(tracks)) * 100
    print(f"  {genre:15} {count:3} tracks ({percentage:4.1f}%)")

# 2. Source Detection
print("\n📂 SOURCE DISTRIBUTION")
print("-" * 40)

sources = []
for track in tracks:
    filepath = track.get('file', '')
    if 'fma_small' in filepath:
        sources.append('FMA')
    elif 'musopen' in filepath.lower():
        sources.append('Musopen')
    else:
        sources.append('Other')

source_counts = Counter(sources)
for source, count in source_counts.items():
    percentage = (count / len(tracks)) * 100
    print(f"  {source:8} {count:3} tracks ({percentage:4.1f}%)")

# 3. Feature Analysis by Genre
print("\n📈 ACOUSTIC SPACE BY GENRE")
print("-" * 60)

# Features to analyze
features = ['rms', 'zcr', 'centroid', 'spread', 'flatness']
feature_names = {
    'rms': 'Energy (RMS)',
    'zcr': 'Activity (ZCR)',
    'centroid': 'Brightness',
    'spread': 'Bandwidth',
    'flatness': 'Tonal vs Noisy'
}

# Calculate per-genre averages (using median/p50 values)
genre_profiles = {}

for genre in set(genres):
    genre_tracks = [t for t in tracks if t.get('genre') == genre]
    if len(genre_tracks) < 3:
        continue  # Skip genres with too few tracks
        
    genre_profiles[genre] = {}
    
    for feature in features:
        values = []
        for track in genre_tracks:
            if 'features' in track and feature in track['features']:
                feat_vals = track['features'][feature]
                # Handle None or invalid values
                if feat_vals is None:
                    continue
                if isinstance(feat_vals, list) and len(feat_vals) >= 2:
                    # Use median (p50) - second value
                    val = feat_vals[1]
                    if val is not None and not np.isnan(val):
                        values.append(val)
                elif isinstance(feat_vals, (int, float)):
                    if not np.isnan(feat_vals):
                        values.append(feat_vals)
        
        if values and len(values) > 0:
            genre_profiles[genre][feature] = {
                'mean': float(np.mean(values)),
                'std': float(np.std(values)) if len(values) > 1 else 0,
                'min': float(min(values)),
                'max': float(max(values)),
                'count': len(values)
            }

# Display acoustic profiles
for genre in sorted(genre_profiles.keys()):
    print(f"\n  {genre}:")
    profile = genre_profiles[genre]
    for feature in features:
        if feature in profile:
            val = profile[feature]['mean']
            count = profile[feature]['count']
            
            # Add simple visual indicator (low/med/high)
            if feature == 'rms':
                if val < 0.03:
                    indicator = '🔇 Very Quiet'
                elif val < 0.06:
                    indicator = '🔉 Moderate'
                elif val < 0.1:
                    indicator = '🔊 Loud'
                else:
                    indicator = '📢 Very Loud'
            elif feature == 'centroid':
                if val < 12:
                    indicator = '🎻 Dark/Bassy'
                elif val < 20:
                    indicator = '🎺 Warm'
                elif val < 30:
                    indicator = '🔔 Bright'
                else:
                    indicator = '✨ Very Bright'
            elif feature == 'flatness':
                if val < 0.05:
                    indicator = '🎵 Very Tonal'
                elif val < 0.15:
                    indicator = '🎶 Tonal'
                elif val < 0.3:
                    indicator = '🎛️ Mixed'
                else:
                    indicator = '📻 Noisy'
            elif feature == 'zcr':
                if val < 20:
                    indicator = '🐢 Low Activity'
                elif val < 40:
                    indicator = '⚡ Moderate'
                else:
                    indicator = '🔥 High Activity'
            elif feature == 'spread':
                if val < 10:
                    indicator = '🎯 Narrow'
                elif val < 15:
                    indicator = '📊 Balanced'
                else:
                    indicator = '🌊 Wide'
            else:
                indicator = ''
            
            print(f"    {feature_names[feature]:15}: {val:6.3f}  {indicator} (n={count})")

# 4. Identify Gaps
print("\n🎯 ACOUSTIC GAP ANALYSIS")
print("-" * 60)

# Calculate overall ranges
all_values = {}
for feature in features:
    vals = []
    for track in tracks:
        if 'features' in track and feature in track['features']:
            feat_vals = track['features'][feature]
            if feat_vals is None:
                continue
            if isinstance(feat_vals, list) and len(feat_vals) >= 2:
                val = feat_vals[1]
                if val is not None and not np.isnan(val):
                    vals.append(val)
            elif isinstance(feat_vals, (int, float)):
                if not np.isnan(feat_vals):
                    vals.append(feat_vals)
    
    if vals and len(vals) > 0:
        all_values[feature] = {
            'min': float(np.percentile(vals, 5)),  # Bottom 5%
            'max': float(np.percentile(vals, 95)),  # Top 5%
            'low_20': float(np.percentile(vals, 20)),
            'high_80': float(np.percentile(vals, 80)),
            'mean': float(np.mean(vals)),
            'count': len(vals)
        }

# Find under-represented acoustic spaces
print("\n  Under-represented acoustic territories:")
print("  (genres that could be added)\n")

# Check for missing extremes
if 'rms' in all_values:
    if all_values['rms']['min'] < 0.02:
        print("  ✓ Already have VERY QUIET tracks (rms < 0.02)")
    else:
        print(f"  ✗ Missing: Very quiet/ambient tracks (lowest rms = {all_values['rms']['min']:.3f})")

    if all_values['rms']['max'] > 0.15:
        print("  ✓ Already have VERY LOUD tracks (rms > 0.15)")
    else:
        print(f"  ✗ Missing: Very loud/intense tracks (highest rms = {all_values['rms']['max']:.3f})")
else:
    print("  ⚠ Could not analyze rms values")

if 'centroid' in all_values:
    if all_values['centroid']['min'] < 10:
        print("  ✓ Already have DARK tracks (centroid < 10)")
    else:
        print(f"  ✗ Missing: Dark/bassy tracks (lowest centroid = {all_values['centroid']['min']:.1f})")

    if all_values['centroid']['max'] > 35:
        print("  ✓ Already have VERY BRIGHT tracks (centroid > 35)")
    else:
        print(f"  ✗ Missing: Bright/trebly tracks (highest centroid = {all_values['centroid']['max']:.1f})")
else:
    print("  ⚠ Could not analyze centroid values")

if 'flatness' in all_values:
    if all_values['flatness']['max'] > 0.5:
        print("  ✓ Already have NOISY/ATONAL tracks (flatness > 0.5)")
    else:
        print(f"  ✗ Missing: Noisy/experimental textures (highest flatness = {all_values['flatness']['max']:.3f})")
else:
    print("  ⚠ Could not analyze flatness values")

# 5. Source-Specific Observations
print(f"\n📋 SOURCE BREAKDOWN")
print("-" * 40)

fma_tracks = [t for t in tracks if 'fma_small' in t.get('file', '')]
musopen_tracks = [t for t in tracks if 'musopen' in t.get('file', '').lower()]

print(f"\n  FMA ({len(fma_tracks)} tracks):")
fma_genres = [t.get('genre', 'Unknown') for t in fma_tracks if 'genre' in t]
for genre, count in Counter(fma_genres).most_common(5):
    print(f"    • {genre}: {count}")

print(f"\n  Musopen ({len(musopen_tracks)} tracks):")
print(f"    • Classical/Orchestral: {len(musopen_tracks)}")

# 6. Recommendations
print("\n💡 RECOMMENDATIONS FOR LIBRARY EXPANSION")
print("-" * 60)

# Based on gaps found
print("\n  Priority 1 - Fill acoustic gaps:")

if 'rms' in all_values:
    if all_values['rms']['min'] >= 0.02:
        print("  • Add AMBIENT/QUIET tracks (YouTube Audio Library: filter 'Ambient', 'Cinematic Minimal')")
    
    if all_values['rms']['max'] <= 0.15:
        print("  • Add HIGH-ENERGY tracks (YouTube Audio Library: filter 'Intense', 'Powerful')")
else:
    print("  • Unable to assess energy gaps - check feature extraction")

if 'centroid' in all_values:
    if all_values['centroid']['min'] >= 10:
        print("  • Add DARK/BASSY tracks (YouTube Audio Library: filter 'Horror', 'Dark', 'Suspense')")
    
    if all_values['centroid']['max'] <= 35:
        print("  • Add BRIGHT/ETHEREAL tracks (Audionautix: Americana has bright acoustic textures)")
else:
    print("  • Unable to assess brightness gaps")

if 'flatness' in all_values:
    if all_values['flatness']['max'] <= 0.5:
        print("  • Add TEXTURAL/NOISY tracks (Freesound.org - Phase 4)")
else:
    print("  • Unable to assess texture gaps")

print("\n  Priority 2 - Deepen existing strengths:")

# Check genre depth
small_genres = [g for g, c in genre_counts.items() if c < 15 and g not in ['Unknown', 'Classical']]
if small_genres:
    print(f"  • Deepen small genres: {', '.join(small_genres[:3])}")
    if 'Rock' in small_genres:
        print("    - Add more ROCK via YouTube Audio Library (filter 'Rock', 'Guitar')")
    if 'Hip-Hop' in small_genres:
        print("    - Add more HIP-HOP via YouTube Audio Library")
    if 'Pop' in small_genres:
        print("    - Add more POP via YouTube Audio Library")

print("\n  Priority 3 - Add new acoustic territories:")
print("  • American Roots/Acoustic (Audionautix) - banjo, fiddle, acoustic guitar textures")
print("  • Modern Cinematic (Scott Buckley) - epic orchestral with contemporary production")
print("  • World Music beyond FMA's International (FMA deeper dive or specific searches)")

print("\n✅ Analysis complete!")