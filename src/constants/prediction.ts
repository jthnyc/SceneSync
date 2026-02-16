// src/constants/prediction.ts
//
// Shared constants for prediction display logic.
// Import from here rather than defining locally in components —
// both PredictionResults and MainContent use SPLIT_THRESHOLD
// and must always agree on the value.

// When the top two scene type probabilities are within this many percentage
// points of each other, the result is considered a genuine split and both
// candidates are shown to the user rather than a single winner.
export const SPLIT_THRESHOLD = 0.10;