import React from 'react';

interface BrandMarkProps {
  variant?: 'light' | 'dark';
  size?: 'sm' | 'md' | 'lg';
}

export function BrandMark({ variant = 'dark', size = 'md' }: BrandMarkProps) {
  const textColor = variant === 'light' ? 'text-white' : 'text-[#0f2544]';
  const dotColor = variant === 'light' ? 'text-blue-400' : 'text-blue-600';
  const iconBox = variant === 'light' ? 'bg-blue-500/20 border-blue-400/30 text-blue-300' : 'bg-[#0f2544] border-[#0f2544] text-white';

  const textSize =
    size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-base' : 'text-xl';
  const boxSize =
    size === 'lg' ? 'w-9 h-9' : size === 'sm' ? 'w-7 h-7' : 'w-8 h-8';

  return (
    <div className="inline-flex items-center gap-2.5 whitespace-nowrap shrink-0 select-none">
      <div className={`${boxSize} rounded-lg border flex items-center justify-center shrink-0 ${iconBox}`}>
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M4 17V7l8-3 8 3v10l-8 3-8-3Z" />
          <path d="M4 12h16" />
          <path d="M12 4v16" />
        </svg>
      </div>
      <span className={`font-display font-bold tracking-tight ${textSize} ${textColor}`}>
        novo<span className={dotColor}>.</span>forteflex
      </span>
    </div>
  );
}
