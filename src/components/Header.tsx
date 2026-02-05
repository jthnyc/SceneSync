import React from 'react';

const Header: React.FC = () => {
  return (
    <div className="mb-8">
      <div className="inline-flex items-start gap-3 mb-1 relative">
        <div className="absolute -inset-2 bg-primary-500/15 rounded-xl blur-xl"></div>
        <img 
          src="/logo192.png" 
          alt="SceneSync" 
          className="relative w-10 h-10 sm:w-12 sm:h-12"
        />
        <div>
          <h1 className="relative text-4xl font-bold text-primary-500 leading-none">SceneSync</h1>
          <p className="text-gray-300 text-sm mt-1">AI-Powered Film Music Scene Classifier</p>
        </div>
      </div>
    </div>
  );
};

export default Header;