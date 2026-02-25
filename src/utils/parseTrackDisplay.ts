// Converts a raw file path from feature_vectors.json into display-ready strings.
//
// Two path shapes exist in the library:
//   FMA:     "./data/fma_small/125/125813.mp3"
//   Musopen: "data/musopen/Musopen DVD/String Quartets/Mozart.../Track Name.mp3"
//
// FMA tracks have no human-readable title in the path — we surface the
// numeric ID and let the genre label (Phase 3) do the heavy lifting.
// Musopen paths are rich — the filename is the track name, the parent
// folder is often the work or ensemble.

export interface TrackDisplay {
  title: string;
  subtitle: string;
  source: string;
}

export function parseTrackDisplay(filePath: string): TrackDisplay {
  const isMusopen = filePath.includes('musopen') || filePath.includes('Musopen');

  if (isMusopen) {
    const parts = filePath.split('/').filter(Boolean);
    const fileName = parts[parts.length - 1].replace(/\.mp3$/i, '');
    // One folder up from the file is usually the work or ensemble name.
    // Two folders up is the category (String Quartets, Orchestral, etc.).
    // Skip generic folder names that add no information.
    const SKIP = new Set(['Musopen DVD', 'musopen', 'data']);
    const parentFolder = [...parts].reverse()
      .slice(1)
      .find(p => !SKIP.has(p)) ?? '';

    return {
      title: fileName,
      subtitle: parentFolder !== fileName ? parentFolder : '',
      source: 'Musopen · CC0',
    };
  }

  // FMA — extract numeric track ID from filename
  const match = filePath.match(/(\d{6})\.mp3$/i);
  const trackId = match ? match[1] : filePath.split('/').pop()?.replace('.mp3', '') ?? 'Unknown';

  return {
    title: `FMA Track ${trackId}`,
    subtitle: 'Free Music Archive',
    source: 'FMA · CC BY',
  };
}