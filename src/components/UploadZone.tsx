import React, { useState, useRef } from 'react';
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
  const inputRef = useRef<HTMLInputElement>(null);

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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Allow Enter or Space to trigger file picker
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      inputRef.current?.click();
    }
  };

  const disabled = isPredicting || isLoading || hasError;

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label="Upload audio file. Press Enter to browse files or drag and drop an audio file here."
      aria-disabled={disabled}
      onKeyDown={handleKeyDown}
      className={`
        border-2 border-dashed rounded-lg p-8 sm:p-12 text-center cursor-pointer
        transition-all hover:border-primary-500 hover:bg-gray-800/30
        min-h-[180px] sm:min-h-[200px] flex flex-col items-center justify-center
        focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-gray-900
        ${dragActive ? 'border-primary-500 bg-primary-500/10' : 'border-gray-600'}
        ${isPredicting ? 'border-yellow-500 bg-yellow-500/10' : ''}
        ${hasError ? 'opacity-50 cursor-not-allowed' : ''}
      `}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      onClick={() => !disabled && inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept="audio/*"
        onChange={onFileChange}
        disabled={disabled}
        className="hidden"
        aria-label="Select audio file"
      />
      <Upload className="mx-auto mb-4 text-gray-400" size={48} aria-hidden="true" />
      <p className="text-base sm:text-lg mb-2">
        {hasError 
          ? 'Model must be loaded before uploading' 
          : 'Drop audio file here or click to browse'
        }
      </p>
      <p className="text-xs sm:text-sm text-gray-500">
        Supports: MP3, WAV, M4A, etc.
      </p>
    </div>
  );
};

export default UploadZone;