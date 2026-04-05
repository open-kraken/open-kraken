import type { ReactNode } from 'react';
import type { AppRouteId } from '@/routes';

type NavRouteIconProps = {
  routeId: AppRouteId;
  className?: string;
  title?: string;
};

const IconBox = ({ className, title, children }: { className?: string; title?: string; children: ReactNode }) => (
  <span className={className} title={title} aria-hidden="true">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" role="img">
      {children}
    </svg>
  </span>
);

export const NavRouteIcon = ({ routeId, className, title }: NavRouteIconProps) => {
  const stroke = 'currentColor';
  const common = { strokeWidth: 1.75, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

  switch (routeId) {
    case 'chat':
      return (
        <IconBox className={className} title={title}>
          <path d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.77 9.77 0 0 1-4-.8L3 21l1.2-3.6A7.96 7.96 0 0 1 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8Z" stroke={stroke} {...common} fill="none" />
        </IconBox>
      );
    case 'members':
      return (
        <IconBox className={className} title={title}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" stroke={stroke} {...common} fill="none" />
          <circle cx="9" cy="7" r="4" stroke={stroke} {...common} fill="none" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke={stroke} {...common} fill="none" />
        </IconBox>
      );
    case 'roadmap':
      return (
        <IconBox className={className} title={title}>
          <path d="M3 6h18M3 12h12M3 18h8" stroke={stroke} {...common} fill="none" />
          <path d="M18 9v12M15 18l3 3 3-3" stroke={stroke} {...common} fill="none" />
        </IconBox>
      );
    case 'terminal':
      return (
        <IconBox className={className} title={title}>
          <rect x="3" y="4" width="18" height="16" rx="2" stroke={stroke} {...common} fill="none" />
          <path d="m7 9 2 2-2 2M11 15h5" stroke={stroke} {...common} fill="none" />
        </IconBox>
      );
    case 'system':
      return (
        <IconBox className={className} title={title}>
          <rect x="5" y="4" width="14" height="16" rx="2" stroke={stroke} {...common} fill="none" />
          <path d="M9 8h6M9 12h6M9 16h4" stroke={stroke} {...common} fill="none" />
        </IconBox>
      );
    case 'settings':
      return (
        <IconBox className={className} title={title}>
          <circle cx="12" cy="12" r="3" stroke={stroke} {...common} fill="none" />
          <path
            d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
            stroke={stroke}
            {...common}
            fill="none"
          />
        </IconBox>
      );
    case 'nodes':
      return (
        <IconBox className={className} title={title}>
          <rect x="3" y="3" width="7" height="7" rx="1" stroke={stroke} {...common} fill="none" />
          <rect x="14" y="3" width="7" height="7" rx="1" stroke={stroke} {...common} fill="none" />
          <rect x="14" y="14" width="7" height="7" rx="1" stroke={stroke} {...common} fill="none" />
          <rect x="3" y="14" width="7" height="7" rx="1" stroke={stroke} {...common} fill="none" />
        </IconBox>
      );
    case 'dashboard':
      return (
        <IconBox className={className} title={title}>
          <path d="M3 3v18h18" stroke={stroke} {...common} fill="none" />
          <path d="M7 16v-4M12 16V8M17 16v-7" stroke={stroke} {...common} fill="none" />
        </IconBox>
      );
    case 'ledger':
      return (
        <IconBox className={className} title={title}>
          <path
            d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"
            stroke={stroke}
            {...common}
            fill="none"
          />
          <path
            d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"
            stroke={stroke}
            {...common}
            fill="none"
          />
          <path d="M8 7h8M8 11h6" stroke={stroke} {...common} fill="none" />
        </IconBox>
      );
    default:
      return (
        <IconBox className={className} title={title}>
          <circle cx="12" cy="12" r="9" stroke={stroke} {...common} fill="none" />
        </IconBox>
      );
  }
};
