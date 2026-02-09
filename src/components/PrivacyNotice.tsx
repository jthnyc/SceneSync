import { Shield, Database } from 'lucide-react';

export function PrivacyNotice() {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
      <div className="flex items-start gap-3">
        <Shield className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-blue-900 mb-1">
            Privacy-First Processing
          </h3>
          <p className="text-xs text-blue-800 leading-relaxed">
            All audio files are processed and stored <strong>locally in your browser only</strong>.
            Nothing is uploaded to our servers. Your files remain on your device and are cleared
            when you clear your browser data.
          </p>
        </div>
      </div>
    </div>
  );
}

interface StorageInfoProps {
  fileCount: number;
  totalSize: number;
  onClear: () => void;
}

export function StorageInfo({ fileCount, totalSize, onClear }: StorageInfoProps) {
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  if (fileCount === 0) return null;

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-gray-500" />
          <span className="text-xs text-gray-600">
            {fileCount} {fileCount === 1 ? 'file' : 'files'} stored • {formatBytes(totalSize)}
          </span>
        </div>
        <button
          onClick={onClear}
          className="text-xs text-red-600 hover:text-red-700 font-medium focus:outline-none focus:underline"
          aria-label="Clear all stored files"
        >
          Clear All
        </button>
      </div>
    </div>
  );
}