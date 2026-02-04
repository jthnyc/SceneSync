// File validation utilities

export interface FileValidationResult {
  isValid: boolean;
  error?: string;
  errorType?: 'size' | 'format' | 'corrupt';
}

// Supported audio formats
const SUPPORTED_FORMATS = [
  'audio/mpeg',      // MP3
  'audio/mp3',       // MP3 (alternative)
  'audio/wav',       // WAV
  'audio/wave',      // WAV (alternative)
  'audio/x-wav',     // WAV (alternative)
  'audio/mp4',       // M4A
  'audio/x-m4a',     // M4A (alternative)
  'audio/aac',       // AAC
  'audio/ogg',       // OGG
  'audio/webm',      // WebM
  'audio/flac',      // FLAC
];

const SUPPORTED_EXTENSIONS = [
  '.mp3',
  '.wav',
  '.m4a',
  '.aac',
  '.ogg',
  '.webm',
  '.flac',
];

// Max file size: 50MB
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB in bytes

/**
 * Validate audio file before processing
 */
export const validateAudioFile = (file: File): FileValidationResult => {
  // Check if file exists
  if (!file) {
    return {
      isValid: false,
      error: 'No file selected',
      errorType: 'format',
    };
  }

  // Check file size
  if (file.size === 0) {
    return {
      isValid: false,
      error: 'File appears to be empty or corrupted',
      errorType: 'corrupt',
    };
  }

  if (file.size > MAX_FILE_SIZE) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    return {
      isValid: false,
      error: `File is too large (${sizeMB}MB). Maximum size is 50MB`,
      errorType: 'size',
    };
  }

  // Check file type by MIME type
  const mimeType = file.type.toLowerCase();
  const isSupportedMime = SUPPORTED_FORMATS.includes(mimeType);

  // Check file extension as fallback
  const fileName = file.name.toLowerCase();
  const hasValidExtension = SUPPORTED_EXTENSIONS.some(ext => fileName.endsWith(ext));

  if (!isSupportedMime && !hasValidExtension) {
    return {
      isValid: false,
      error: `Unsupported file format. Please use: ${SUPPORTED_EXTENSIONS.join(', ')}`,
      errorType: 'format',
    };
  }

  // Basic audio file validation (check if it's likely an audio file)
  if (file.type && !file.type.startsWith('audio/') && !hasValidExtension) {
    return {
      isValid: false,
      error: 'File does not appear to be an audio file',
      errorType: 'format',
    };
  }

  return {
    isValid: true,
  };
};

/**
 * Format file size for display
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

/**
 * Get user-friendly error message for specific error types
 */
export const getErrorMessage = (error: Error | string): string => {
  const errorMessage = typeof error === 'string' ? error : error.message;

  // Network errors
  if (errorMessage.includes('NetworkError') || errorMessage.includes('Failed to fetch')) {
    return 'Network error. Please check your internet connection and try again.';
  }

  // Model loading errors
  if (errorMessage.includes('model') && errorMessage.includes('load')) {
    return 'Failed to load the AI model. Please refresh the page and try again.';
  }

  // Audio decoding errors
  if (errorMessage.includes('decode') || errorMessage.includes('AudioContext')) {
    return 'Failed to decode audio file. The file may be corrupted or in an unsupported format.';
  }

  // Feature extraction errors
  if (errorMessage.includes('feature') || errorMessage.includes('extract')) {
    return 'Failed to analyze audio features. Please try a different file.';
  }

  // Out of memory
  if (errorMessage.includes('memory') || errorMessage.includes('heap')) {
    return 'Audio file is too large for your device. Try a shorter or lower quality file.';
  }

  // Generic fallback
  return errorMessage || 'An unexpected error occurred. Please try again.';
};