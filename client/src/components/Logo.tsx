import React from 'react';
import { Activity } from 'lucide-react';

const Logo: React.FC<{ theme?: 'light' | 'dark' }> = ({ theme = 'light' }) => {
  const textColor = theme === 'light' ? 'text-white' : 'text-gray-800';
  const subColor = theme === 'light' ? 'text-white/80' : 'text-gray-500';

  return (
    <div className="flex items-center gap-3">
      <div className="bg-white p-2 rounded-lg shadow-sm">
        <Activity className="w-8 h-8 text-primary" />
      </div>
      <div>
        <h1 className={`text-xl font-bold ${textColor} leading-tight`}>Centro do Cérebro</h1>
        <p className={`text-xs ${subColor} font-medium tracking-wider`}>E COLUNA</p>
      </div>
    </div>
  );
};

export default Logo;
