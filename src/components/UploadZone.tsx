import React, { useState } from 'react';
import { Upload } from 'lucide-react';

interface UploadZoneProps {
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onFileDrop: (e: React.DragEvent) => void;
  isPredicting: boolean;
  isLoading: boolean;
  hasError: boolean;
}

const UploadZone: React.FC<UploadZoneProps> = ({
  onFileChange,
  onFileDrop,
  isPredicting,
  isLoading,
  hasError,
}) => {
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    onFileDrop(e);
  };

  return (
    <label className="block">
      <div 
        className={`
          border-2 border-dashed rounded-lg p-12 text-center cursor-pointer
          transition-all hover:border-primary-500 hover:bg-gray-800/30
          ${dragActive ? 'border-primary-500 bg-primary-500/10' : 'border-gray-600'}
          ${isPredicting ? 'border-yellow-500 bg-yellow-500/10' : ''}
          ${hasError ? 'opacity-50 cursor-not-allowed' : ''}
        `}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          type="file"
          accept="audio/*"
          onChange={onFileChange}
          disabled={isPredicting || isLoading || hasError}
          className="hidden"
        />
        <Upload className="mx-auto mb-4 text-gray-400" size={48} />
        <p className="text-lg mb-2">
          {hasError 
            ? 'Model must be loaded before uploading' 
            : 'Drop audio file here or click to browse'
          }
        </p>
        <p className="text-sm text-gray-500">
          Supports: MP3, WAV, M4A, etc.
        </p>
      </div>
    </label>
  );
};

export default UploadZone;
