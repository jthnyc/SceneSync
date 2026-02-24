# Curation Notes

## Goal
Select ~200 tracks from the 7990 extracted for use in the app library.

## Inclusion criteria
- Clearly musical content (no spoken word, podcasts, field recordings)
- Clean audio — no corruption warnings during extraction
- Cinematically plausible — could reasonably appear in a film score or temp track
- Acoustic diversity — aim for spread across energy, brightness, texture, activity

## Known exclusions
- 004848 — spoken word / no musical content. Genre label in FMA metadata unknown (not verified). Removed from feature_vectors.json before curation. Do not re-add.

## QA observations (Feb 24, 2026 — Instrumental spot-check, 6 tracks)

### Label accuracy
Summaries were mostly accurate. Three edge cases that reflect known limitations:

- **128471** — piano melody pulls brightness toward mid-range perceptually, but bass content drags the centroid down to `dark`. Centroid captures the whole spectrum, not the lead instrument. Expected behavior, not a bug.
- **081586** — drums push texture to `mixed` even though the track feels tonal overall. Drum transients inflate spectral flatness. Documented limitation.
- **116549** — orchestral piece. Brightness reads `dark` but feels more mid-range; texture reads `mixed` but feels `tonal`. Wide string frequency spread pulls centroid down; ensemble density inflates flatness. Both are centroid/flatness limitations on complex orchestral arrangements.

These are not exclusions — the vectors are correct. The plain-language labels lose nuance. Revisit in Phase 3 when building the explanation layer.

### Diversity observation
The 6-track sample clustered around medium energy, medium tempo, medium activity. Nothing that reads as a swelling orchestral theme or an action-packed cue. This is likely intrinsic to FMA small — it's indie/underground music, not composed-for-drama music. The acoustic diversity sampling is working correctly within the dataset, but the dataset itself occupies a narrower dynamic range than cinematic music requires. **This is exactly the gap Musopen is intended to fill.** Expect FMA tracks to anchor the middle of the library; Musopen to provide the dramatic extremes.

## Known limitations (revisit Phase 3/4)
- Vocal tracks: RMS underestimates perceived loudness on compressed vocal recordings
- Drum transients push flatness toward "noisy" even on tonal tracks
- No vocal detection — "brightness" doesn't distinguish voice type from instrument brightness
- Single summary value per feature loses arc information (captured in vector, not in label)
- Centroid is pulled toward bass-heavy frequencies even when the perceptual lead is a bright instrument (e.g. piano over bass)
- Orchestral arrangements with wide frequency spread tend to read darker and noisier than they sound