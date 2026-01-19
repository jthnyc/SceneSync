import React, { useCallback } from 'react';
import { Upload, X, Music } from 'lucide-react';
import { AudioFile } from '../../types/audio';

const UploadZone: React.FC = () => {
  const [isDragging, setIsDragging] = React.useState(false);
  const [uploadQueue, setUploadQueue] = React.useState<AudioFile[]>([]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    // TODO: Implement actual file processing
    console.log('Files dropped:', files);
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      // TODO: Implement actual file processing
      console.log('Files selected:', Array.from(files));
    }
  }, []);

  return (
    <div className="h-full p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Upload Queue</h3>
        <div className="text-sm text-gray-400">
          {uploadQueue.length} file{uploadQueue.length !== 1 ? 's' : ''} pending
        </div>
      </div>

      {/* Drag & Drop Area */}
      <div
        className={`
          relative border-2 border-dashed rounded-xl p-6 mb-4
          transition-all duration-200
          ${isDragging 
            ? 'border-primary-500 bg-primary-500/10' 
            : 'border-gray-700 hover:border-gray-600'
          }
        `}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          type="file"
          multiple
          accept="audio/*,.mp3,.wav,.flac,.m4a,.aac"
          onChange={handleFileSelect}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
        
        <div className="text-center">
          <Upload className={`mx-auto mb-3 ${isDragging ? 'text-primary-500' : 'text-gray-500'}`} size={32} />
          <p className="font-medium mb-1">
            {isDragging ? 'Drop files here' : 'Drag & drop audio files'}
          </p>
          <p className="text-sm text-gray-400 mb-3">
            or click to browse (max 10 files, 500MB each)
          </p>
          <div className="flex flex-wrap justify-center gap-2 text-xs text-gray-500">
            <span className="px-2 py-1 bg-gray-800 rounded">MP3</span>
            <span className="px-2 py-1 bg-gray-800 rounded">WAV</span>
            <span className="px-2 py-1 bg-gray-800 rounded">FLAC</span>
            <span className="px-2 py-1 bg-gray-800 rounded">M4A</span>
            <span className="px-2 py-1 bg-gray-800 rounded">AAC</span>
          </div>
        </div>
      </div>

      {/* Upload Queue Display */}
      <div className="space-y-2 max-h-32 overflow-y-auto">
        {uploadQueue.length === 0 ? (
          <div className="text-center py-4 text-gray-500">
            <Music className="mx-auto mb-2" size={24} />
            <p className="text-sm">No files in queue</p>
          </div>
        ) : (
          uploadQueue.map((file) => (
            <div key={file.id} className="flex items-center justify-between bg-gray-800/50 p-3 rounded-lg">
              <div className="flex items-center gap-3">
                <Music size={16} className="text-gray-400" />
                <div>
                  <p className="text-sm font-medium truncate max-w-[200px]">{file.name}</p>
                  <p className="text-xs text-gray-400">{Math.round(file.size / 1024)} KB</p>
                </div>
              </div>
              <button className="p-1 hover:bg-gray-700 rounded">
                <X size={16} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default UploadZone;