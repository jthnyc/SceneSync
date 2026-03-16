// ── useFileHandler ────────────────────────────────────────────────────────
// Owns file selection state, validation, and the post-extraction side-effect
// chain: addTrack → explainReference → onTrackAdded.
//
// Does NOT own: activeTrack, selectedTrackId, clearResults, clearExplanations.
// Those are cross-cutting concerns coordinated by App.tsx.

import { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import { validateAudioFile } from '../utils/fileValidation';
import type { TrackDisplay } from '../utils/parseTrackDisplay';
import type { FeatureVector } from '../workers/featureExtraction.types';

interface UseFileHandlerParams {
  referenceFeatureVector: FeatureVector | null;
  referenceDuration: number | null;
  findSimilar: (file: File) => void;
  addTrack: (file: File, featureVector: FeatureVector, duration: number | null) => Promise<string | null>;
  explainReference: (featureVector: FeatureVector, trackId: string) => Promise<void>;
  onFileReady: (track: { file: File; features?: FeatureVector; metadata: TrackDisplay }) => void;
  onTrackAdded: (trackId: string) => void;
}

export const useFileHandler = ({
  referenceFeatureVector,
  referenceDuration,
  findSimilar,
  addTrack,
  explainReference,
  onFileReady,
  onTrackAdded,
}: UseFileHandlerParams) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // pendingFile holds the file that triggered the current extraction run.
  // It is set when a new file is accepted, and cleared after addTrack fires.
  // This is the authoritative guard for the effect — not selectedFile —
  // so history-triggered featureVector changes never fire addTrack.
  const pendingFile = useRef<File | null>(null);

  // ── Post-extraction effect ─────────────────────────────────────────────
  // Fires when referenceFeatureVector arrives from the worker.
  // Only proceeds if pendingFile is set — meaning a fresh upload caused this.
  useEffect(() => {
    if (!referenceFeatureVector || !pendingFile.current) return;
    const file = pendingFile.current;
    pendingFile.current = null; // clear immediately to prevent re-fire

    addTrack(file, referenceFeatureVector, referenceDuration)
      .then((trackId) => {
        if (trackId) {
          onTrackAdded(trackId);
          explainReference(referenceFeatureVector, trackId);
        }
      });
    // addTrack and onTrackAdded are stable refs (useCallback in their
    // respective hooks/App.tsx). explainReference intentionally excluded —
    // including it causes a feedback loop with selectedTrackId in
    // useExplanationCache. Matches original App.tsx behaviour.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [referenceFeatureVector]);

  // ── Shared file intake logic ───────────────────────────────────────────
  const handleFile = useCallback((file: File) => {
    const validation = validateAudioFile(file);
    if (!validation.isValid) {
      toast.error(validation.error || 'Invalid file', { duration: 5000 });
      return false;
    }

    const metadata: TrackDisplay = {
      title: file.name,
      subtitle: 'Your reference',
      source: 'Uploaded file',
    };

    pendingFile.current = file; // arm the effect before findSimilar fires
    setSelectedFile(file);
    onFileReady({ file, metadata });
    findSimilar(file);
    return true;
  }, [findSimilar, onFileReady]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const accepted = handleFile(file);
    if (!accepted) e.target.value = '';
  }, [handleFile]);

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    handleFile(file);
  }, [handleFile]);

  const clearFile = useCallback(() => {
    pendingFile.current = null;
    setSelectedFile(null);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
  }, []);

  return {
    selectedFile,
    handleFileChange,
    handleFileDrop,
    clearFile,
  };
};