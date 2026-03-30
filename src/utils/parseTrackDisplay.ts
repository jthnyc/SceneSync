// Converts a raw file path from feature_vectors.json into display-ready strings.
//
// Three path shapes exist in the library:
//   FMA:     "./data/fma_small/125/125813.mp3"
//   Musopen: "data/musopen/Musopen DVD/String Quartets/Mozart.../Track Name.mp3"
//   YouTube: "./data/youtube/batch1/Track Name - Artist Name.mp3"
//
// FMA tracks have no human-readable title in the path — we surface the
// numeric ID and let the genre label (Phase 3) do the heavy lifting.
// Musopen paths are rich — the filename is the track name, the parent
// folder is often the work or ensemble.
// YouTube Audio Library filenames use "Title - Artist.mp3" convention.

export interface TrackDisplay {
  title: string;
  subtitle: string;
  source: string;
}

export function parseTrackDisplay(filePath: string): TrackDisplay {
  const isMusopen = filePath.includes('musopen') || filePath.includes('Musopen');
  const isYouTube = filePath.includes('youtube') || filePath.includes('YouTube');

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

  if (isYouTube) {
    // YouTube Audio Library filenames: "Track Title - Artist Name.mp3"
    const fileName = filePath.split('/').pop()?.replace(/\.mp3$/i, '') ?? 'Unknown';

    // Split on " - " to separate title from artist
    const dashIndex = fileName.lastIndexOf(' - ');
    if (dashIndex > 0) {
      const title = fileName.substring(0, dashIndex);
      const artist = fileName.substring(dashIndex + 3);
      return {
        title,
        subtitle: artist,
        source: 'YouTube Audio Library',
      };
    }

    return {
      title: fileName,
      subtitle: '',
      source: 'YouTube Audio Library',
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