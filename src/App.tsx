import React from 'react';
import './index.css'; // Make sure this is imported

function App() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-black text-white p-8">
      <h1 className="text-4xl font-bold text-primary-500 mb-4">🎬 SceneSync</h1>
      <p className="text-gray-300 mb-6">Film Music Classifier - Tailwind CSS v3.4.0 is working!</p>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl">
        <div className="bg-gray-800/50 p-6 rounded-xl border border-gray-700">
          <h2 className="text-xl font-semibold text-primary-400 mb-2">✅ Tailwind v3</h2>
          <p className="text-gray-400">Successfully installed and configured</p>
        </div>
        
        <div className="bg-gray-800/50 p-6 rounded-xl border border-gray-700">
          <h2 className="text-xl font-semibold text-green-400 mb-2">✅ React 19 + TypeScript</h2>
          <p className="text-gray-400">Latest versions working</p>
        </div>
        
        <div className="bg-gray-800/50 p-6 rounded-xl border border-gray-700">
          <h2 className="text-xl font-semibold text-yellow-400 mb-2">🚀 Ready to Build</h2>
          <p className="text-gray-400">Three-column layout next</p>
        </div>
      </div>
      
      <div className="mt-8 max-w-4xl">
        <div className="flex space-x-4">
          <div className="w-64 h-64 bg-gray-800/30 rounded-lg border border-dashed border-gray-600 flex items-center justify-center">
            <p className="text-gray-500">Sidebar Area</p>
          </div>
          <div className="flex-1 h-64 bg-gray-800/30 rounded-lg border border-dashed border-gray-600 flex items-center justify-center">
            <p className="text-gray-500">Main Content Area</p>
          </div>
        </div>
        <div className="mt-4 h-32 bg-gray-800/30 rounded-lg border border-dashed border-gray-600 flex items-center justify-center">
          <p className="text-gray-500">Upload Zone</p>
        </div>
      </div>
    </div>
  );
}

export default App;