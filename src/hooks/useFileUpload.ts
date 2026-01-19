import { useState, useCallback } from 'react';
import { AudioFile } from '../types/audio';

export const useFileUpload = () => {
  const [files, setFiles] = useState<AudioFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploadFiles = useCallback(async (fileList: FileList | File[]) => {
    setUploading(true);
    setError(null);
    
    try {
      const newFiles: AudioFile[] = Array.from(fileList).map(file => ({
        id: Math.random().toString(36).substr(2, 9),
        name: file.name,
        size: file.size,
        type: file.type,
        url: URL.createObjectURL(file),
        uploadedAt: new Date(),
      }));
      
      setFiles(prev => [...prev, ...newFiles]);
      return newFiles;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      return [];
    } finally {
      setUploading(false);
    }
  }, []);

  const removeFile = useCallback((id: string) => {
    setFiles(prev => prev.filter(file => file.id !== id));
  }, []);

  const clearFiles = useCallback(() => {
    setFiles([]);
  }, []);

  return { files, uploading, error, uploadFiles, removeFile, clearFiles };
};

export default useFileUpload;