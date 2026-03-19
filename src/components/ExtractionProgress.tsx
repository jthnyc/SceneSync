import React from 'react';

interface ExtractionProgressProps {
  progress: number;
  stage: string;
}

const ExtractionProgress: React.FC<ExtractionProgressProps> = ({ progress, stage }) => {
  return (
    <div
      className="text-center py-8 px-4"
      role="status"
      aria-live="polite"
      aria-label="Audio analysis in progress"
    >
      {/* Animated waveform — mirrors EmptyState's visual weight */}
      <div className="relative w-32 h-16 mx-auto mb-6" aria-hidden="true">
        <div className="absolute inset-0 bg-primary-500/10 rounded-lg blur-xl"></div>
        <div className="relative flex items-end justify-center gap-1.5 h-full">
          {[1/3, 2/3, 1, 3/4, 1/2, 2/3, 1/3].map((h, i) => (
            <div
              key={i}
              className="w-1.5 bg-gradient-to-t from-primary-500/60 to-primary-400/80 rounded-full animate-pulse"
              style={{
                height: `${h * 100}%`,
                animationDelay: `${i * 120}ms`,
              }}
            />
          ))}
        </div>
      </div>

      <h3 className="text-xl font-semibold text-gray-200 mb-2">
        Analyzing your track
      </h3>
      <p className="text-gray-400 text-sm mb-6">
        {stage || 'Preparing...'}
      </p>

      {/* Progress bar */}
      <div className="max-w-xs mx-auto">
        <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary-500 to-primary-400 rounded-full transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-gray-500 text-xs mt-2">{progress}%</p>
      </div>
    </div>
  );
};

export default ExtractionProgress;