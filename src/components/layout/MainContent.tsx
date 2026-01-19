import React from 'react';
import { Music, BarChart3, Clock } from 'lucide-react';

const MainContent: React.FC = () => {
  return (
    <div className="h-full">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2">Audio Analysis Dashboard</h2>
        <p className="text-gray-400">Upload audio files to analyze and classify film music scenes</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Stats Cards */}
        <div className="bg-gray-800/50 rounded-xl p-5 border border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 bg-primary-500/10 rounded-lg">
              <Music className="text-primary-500" size={24} />
            </div>
            <span className="text-sm text-gray-400">Total</span>
          </div>
          <h3 className="text-3xl font-bold mb-1">0</h3>
          <p className="text-gray-400">Audio Tracks</p>
        </div>

        <div className="bg-gray-800/50 rounded-xl p-5 border border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 bg-green-500/10 rounded-lg">
              <BarChart3 className="text-green-500" size={24} />
            </div>
            <span className="text-sm text-gray-400">Processed</span>
          </div>
          <h3 className="text-3xl font-bold mb-1">0</h3>
          <p className="text-gray-400">Analyses Complete</p>
        </div>

        <div className="bg-gray-800/50 rounded-xl p-5 border border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 bg-yellow-500/10 rounded-lg">
              <Clock className="text-yellow-500" size={24} />
            </div>
            <span className="text-sm text-gray-400">Avg Time</span>
          </div>
          <h3 className="text-3xl font-bold mb-1">--</h3>
          <p className="text-gray-400">Processing Time</p>
        </div>
      </div>

      {/* Upload Highlight Area */}
      <div className="bg-gradient-to-r from-gray-800 to-gray-900 border-2 border-dashed border-gray-700 rounded-xl p-8 text-center mb-8">
        <div className="max-w-md mx-auto">
          <Music size={48} className="mx-auto text-gray-500 mb-4" />
          <h3 className="text-xl font-semibold mb-2">Ready to Analyze</h3>
          <p className="text-gray-400 mb-4">
            Drag & drop audio files to the upload zone below or click to browse
          </p>
          <div className="text-sm text-gray-500">
            Supports: MP3, WAV, FLAC, M4A • Max 500MB
          </div>
        </div>
      </div>

      {/* Recent Analyses Placeholder */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Recent Analyses</h3>
        <div className="bg-gray-800/30 rounded-lg p-8 text-center border border-gray-700">
          <p className="text-gray-500">No analyses yet. Upload your first audio file!</p>
        </div>
      </div>
    </div>
  );
};

export default MainContent;