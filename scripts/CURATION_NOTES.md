# Curation Notes

## Goal
Select ~200 tracks from the 7990 extracted for use in the app library.

## Inclusion criteria
- Clearly musical content (no spoken word, podcasts, field recordings)
- Clean audio — no corruption warnings during extraction
- Cinematically plausible — could reasonably appear in a film score or temp track
- Acoustic diversity — aim for spread across energy, brightness, texture, activity

## Known exclusions
- 004848 — spoken word / no musical content

## Known limitations (revisit Phase 3/4)
- Vocal tracks: RMS underestimates perceived loudness on compressed vocal recordings
- Drum transients push flatness toward "noisy" even on tonal tracks
- No vocal detection — "brightness" doesn't distinguish voice type from instrument brightness
- Single summary value per feature loses arc information (captured in vector, not in label)