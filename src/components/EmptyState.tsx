import React from 'react';
import { Upload, Waves, BarChart3 } from 'lucide-react';

interface EmptyStateProps {
  className?: string;
}

const EmptyState: React.FC<EmptyStateProps> = ({ className = '' }) => {
  return (
    <div 
      className={`text-center py-8 px-4 ${className}`}
      role="region"
      aria-label="Getting started guide"
    >
      {/* Abstract Waveform Bars */}
      <div 
        className="relative w-32 h-16 mx-auto mb-6"
        aria-hidden="true"
      >
        {/* Background glow */}
        <div className="absolute inset-0 bg-primary-500/10 rounded-lg blur-xl"></div>
        
        {/* Waveform bars */}
        <div className="relative flex items-end justify-center gap-1.5 h-full">
          <div className="w-1.5 h-1/3 bg-gradient-to-t from-primary-500/60 to-primary-400/80 rounded-full"></div>
          <div className="w-1.5 h-2/3 bg-gradient-to-t from-primary-500/60 to-primary-400/80 rounded-full"></div>
          <div className="w-1.5 h-full bg-gradient-to-t from-primary-500/60 to-primary-400/80 rounded-full"></div>
          <div className="w-1.5 h-3/4 bg-gradient-to-t from-primary-500/60 to-primary-400/80 rounded-full"></div>
          <div className="w-1.5 h-1/2 bg-gradient-to-t from-primary-500/60 to-primary-400/80 rounded-full"></div>
          <div className="w-1.5 h-2/3 bg-gradient-to-t from-primary-500/60 to-primary-400/80 rounded-full"></div>
          <div className="w-1.5 h-1/3 bg-gradient-to-t from-primary-500/60 to-primary-400/80 rounded-full"></div>
        </div>
      </div>

      {/* Heading */}
      <h3 className="text-xl font-semibold text-gray-200 mb-2">
        Ready to Analyze
      </h3>
      <p className="text-gray-400 mb-8 max-w-xs mx-auto text-sm leading-relaxed">
        Upload your first audio track to get AI-powered scene classification
      </p>

      {/* Quick Tips */}
      <div 
        className="space-y-3 text-left max-w-sm mx-auto"
        role="list"
        aria-label="Feature overview"
      >
        <div className="flex items-start gap-3 text-sm" role="listitem">
          <div className="mt-0.5 text-gray-500 flex-shrink-0" aria-hidden="true">
            <Upload size={16} />
          </div>
          <div>
            <span className="text-gray-300 font-medium">Drag & Drop</span>
            <span className="text-gray-500"> or click to upload MP3, WAV, M4A</span>
          </div>
        </div>
        
        <div className="flex items-start gap-3 text-sm" role="listitem">
          <div className="mt-0.5 text-gray-500 flex-shrink-0" aria-hidden="true">
            <Waves size={16} />
          </div>
          <div>
            <span className="text-gray-300 font-medium">Feature Extraction</span>
            <span className="text-gray-500"> analyzes 44 characteristics</span>
          </div>
        </div>
        
        <div className="flex items-start gap-3 text-sm" role="listitem">
          <div className="mt-0.5 text-gray-500 flex-shrink-0" aria-hidden="true">
            <BarChart3 size={16} />
          </div>
          <div>
            <span className="text-gray-300 font-medium">Scene Classification</span>
            <span className="text-gray-500"> into 4 cinematic categories</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmptyState;