import React from 'react';
// import { Activity } from 'lucide-react';

const Logo: React.FC<{ theme?: 'light' | 'dark' }> = () => {
  // const textColor = theme === 'light' ? 'text-white' : 'text-gray-800';
  // const subColor = theme === 'light' ? 'text-white/80' : 'text-gray-500';

  return (
    <div className="flex items-center justify-center w-full">
      <img src="/logo-ccc.png" alt="Centro do Cérebro e Coluna" className="h-16 object-contain" />
    </div>
  );
};

export default Logo;
