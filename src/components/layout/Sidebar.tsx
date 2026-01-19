import React from 'react';
import { 
  Upload, 
  Music, 
  BarChart3, 
  Settings,
  Filter
} from 'lucide-react';

const Sidebar: React.FC = () => {
  const navItems = [
    { icon: <Upload size={20} />, label: 'Upload', active: true },
    { icon: <Music size={20} />, label: 'Library', count: 0 },
    { icon: <BarChart3 size={20} />, label: 'Analytics', count: 0 },
    { icon: <Filter size={20} />, label: 'Filters', count: 0 },
    { icon: <Settings size={20} />, label: 'Settings' },
  ];

  const sceneFilters = [
    { label: 'Action', color: 'bg-red-500', count: 0 },
    { label: 'Romantic', color: 'bg-pink-500', count: 0 },
    { label: 'Suspense', color: 'bg-purple-500', count: 0 },
    { label: 'Dramatic', color: 'bg-blue-500', count: 0 },
    { label: 'Comedy', color: 'bg-yellow-500', count: 0 },
  ];

  return (
    <div className="p-4 h-full flex flex-col">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-primary-500 mb-1">SceneSync</h1>
        <p className="text-sm text-gray-400">Film Music Classifier</p>
      </div>

      <nav className="flex-1">
        <div className="mb-8">
          <h2 className="text-xs uppercase text-gray-500 font-semibold mb-3">Navigation</h2>
          <ul className="space-y-1">
            {navItems.map((item) => (
              <li key={item.label}>
                <button className={`
                  w-full flex items-center justify-between px-3 py-2 rounded-lg
                  transition-colors duration-200
                  ${item.active 
                    ? 'bg-gray-800 text-white' 
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                  }
                `}>
                  <div className="flex items-center gap-3">
                    {item.icon}
                    <span>{item.label}</span>
                  </div>
                  {item.count !== undefined && (
                    <span className="text-xs bg-gray-700 px-2 py-1 rounded-full">
                      {item.count}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="text-xs uppercase text-gray-500 font-semibold mb-3">Scene Filters</h2>
          <div className="space-y-2">
            {sceneFilters.map((filter) => (
              <div key={filter.label} className="flex items-center justify-between p-2 hover:bg-gray-800 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${filter.color}`} />
                  <span className="text-sm">{filter.label}</span>
                </div>
                <span className="text-xs text-gray-400">{filter.count}</span>
              </div>
            ))}
          </div>
        </div>
      </nav>

      <div className="mt-auto pt-4 border-t border-gray-800">
        <div className="text-sm text-gray-400">
          <p>Total Tracks: 0</p>
          <p>Storage: 0 MB / 1 GB</p>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;