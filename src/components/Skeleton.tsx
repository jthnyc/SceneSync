import React from 'react';

interface SkeletonProps {
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = '' }) => {
  return (
    <div className={`animate-pulse bg-gray-700/50 rounded ${className}`} />
  );
};

export const SkeletonText: React.FC<{ lines?: number }> = ({ lines = 3 }) => {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="h-4 w-full" />
      ))}
    </div>
  );
};

export const SkeletonCard: React.FC = () => {
  return (
    <div className="bg-gray-800/50 p-6 rounded-xl border border-gray-700">
      <Skeleton className="h-6 w-32 mb-4" />
      <Skeleton className="h-24 w-full mb-3" />
      <SkeletonText lines={2} />
    </div>
  );
};