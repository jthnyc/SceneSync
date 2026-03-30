// ── entryPoints.ts ────────────────────────────────────────────────────────
// Static config for curated entry point tracks shown in the empty state.
// Each entry maps to a real library track streamed from Cloudflare R2.
//
// r2Path: relative to REACT_APP_R2_PUBLIC_URL (no leading slash, no 'data/' prefix)
// fileName: used to construct the File object passed to the extraction pipeline

export interface EntryPoint {
  zone: string;        // short zone label shown above track name
  descriptor: string;  // one-line acoustic description
  trackName: string;
  artist: string;
  r2Path: string;
  fileName: string;
}

export const ENTRY_POINTS: EntryPoint[] = [
  {
    zone: 'Driving & Tense',
    descriptor: 'High energy, textural, forward motion',
    trackName: 'Challenge Accepted',
    artist: 'The Soundings',
    r2Path: 'youtube/batch2/Challenge Accepted - The Soundings.mp3',
    fileName: 'Challenge Accepted - The Soundings.mp3',
  },
  {
    zone: 'Gentle & Melodic',
    descriptor: 'Quiet, warm, intimate character',
    trackName: 'A Baroque Letter',
    artist: 'Aaron Kenny',
    r2Path: 'youtube/batch2/A Baroque Letter - Aaron Kenny.mp3',
    fileName: 'A Baroque Letter - Aaron Kenny.mp3',
  },
  {
    zone: 'Sparse & Understated',
    descriptor: 'Low energy, open space, restrained',
    trackName: 'FMA Track 130993',
    artist: 'Free Music Archive',
    r2Path: 'fma_small/130/130993.mp3',
    fileName: '130993.mp3',
  },
];