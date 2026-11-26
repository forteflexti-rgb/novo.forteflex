import React from 'react';
import { usePortalConfig, DEFAULT_PORTAL_CONFIG } from '../lib/portalConfig';

interface BrandMarkProps {
  variant?: 'light' | 'dark';
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
}

export function BrandMark({ variant = 'dark', size = 'md' }: BrandMarkProps) {
  const config = usePortalConfig();
  const safeConfig = config || DEFAULT_PORTAL_CONFIG;
  const logoSrc = safeConfig.logoUrl || '/forteflex-logo.png';

  const imgHeight =
    size === 'lg' ? 'h-7 sm:h-8' : size === 'sm' ? 'h-5 sm:h-5.5' : 'h-6 sm:h-6.5';

  if (variant === 'light') {
    return (
      <div className="inline-flex items-center gap-2 select-none">
        <div className="bg-white/95 rounded-lg px-2.5 py-1.5 shadow-sm inline-flex items-center justify-center border border-white/20">
          <img
            src={logoSrc}
            alt={safeConfig.companyName || 'Forteflex'}
            className={`${imgHeight} max-w-[195px] object-contain`}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-2 select-none">
      <img
        src={logoSrc}
        alt={safeConfig.companyName || 'Forteflex'}
        className={`${imgHeight} max-w-[210px] object-contain`}
      />
    </div>
  );
}
