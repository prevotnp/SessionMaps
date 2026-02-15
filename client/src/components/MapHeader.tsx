import React from 'react';
import { Search } from 'lucide-react';

interface MapHeaderProps {
  searchQuery: string;
  onSearchChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSearchSubmit: (e: React.FormEvent) => void;
}

const MapHeader: React.FC<MapHeaderProps> = ({ 
  searchQuery, 
  onSearchChange, 
  onSearchSubmit
}) => {
  return (
    <>
      {/* iOS Status Bar - Fixed at very top */}
      <div className="ios-status-bar absolute top-0 left-0 right-0 z-20 bg-black flex items-center justify-between px-4 py-2">
        <div className="text-sm">
          {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
        <div className="flex items-center space-x-1">
          {/* Signal indicators */}
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zm6-4a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zm6-3a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
          </svg>
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M17.778 8.222c-4.296-4.296-11.26-4.296-15.556 0A1 1 0 01.808 6.808c5.076-5.077 13.308-5.077 18.384 0a1 1 0 01-1.414 1.414zM14.95 11.05a7 7 0 00-9.9 0 1 1 0 01-1.414-1.414 9 9 0 0112.728 0 1 1 0 01-1.414 1.414zM12.12 13.88a3 3 0 00-4.242 0 1 1 0 01-1.415-1.415 5 5 0 017.072 0 1 1 0 01-1.415 1.415zM9 16a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zm6-4a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zm6-3a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
          </svg>
        </div>
      </div>
      
      {/* Search bar - Below status bar */}
      <div className="absolute top-10 left-0 right-0 z-10 px-4 flex justify-end items-center">
        <div className="flex-1 max-w-xs">
          <form onSubmit={onSearchSubmit} className="relative">
            <input 
              type="text" 
              placeholder="Search locations..." 
              className="w-full py-2 px-4 pr-10 rounded-full text-dark bg-white/90 backdrop-blur-sm text-sm"
              value={searchQuery}
              onChange={onSearchChange}
            />
            <button className="absolute right-2 top-1/2 transform -translate-y-1/2 text-dark-gray" type="submit">
              <Search className="h-5 w-5" />
            </button>
          </form>
        </div>
      </div>
    </>
  );
};

export default MapHeader;
