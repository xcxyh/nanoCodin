import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function BaseIcon({ size = 18, children, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function IconTerminal(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </BaseIcon>
  );
}

export function IconCpu(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 15h3M1 9h3M1 15h3" />
    </BaseIcon>
  );
}

export function IconLayers(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 12 12 17 22 12" />
      <polyline points="2 17 12 22 22 17" />
    </BaseIcon>
  );
}

export function IconShield(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 12 2 2 4-4" />
    </BaseIcon>
  );
}

export function IconLock(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </BaseIcon>
  );
}

export function IconDatabase(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
      <path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
    </BaseIcon>
  );
}

export function IconCheckBadge(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="m9 12 2 2 4-4" />
    </BaseIcon>
  );
}

export function IconSpark(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.64 5.64l2.83 2.83M15.53 15.53l2.83 2.83M18.36 5.64l-2.83 2.83M8.47 15.53l-2.83 2.83" />
    </BaseIcon>
  );
}

export function IconFileCode(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <path d="m10 13-2 2 2 2M14 13l2 2-2 2" />
    </BaseIcon>
  );
}

export function IconCopy(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </BaseIcon>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <polyline points="20 6 9 17 4 12" />
    </BaseIcon>
  );
}

export function IconArrowRight(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </BaseIcon>
  );
}

export function IconGitHub(props: IconProps) {
  return (
    <svg
      width={props.size ?? 18}
      height={props.size ?? 18}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      {...props}
    >
      <path d="M12 1.5C6.2 1.5 1.5 6.2 1.5 12c0 4.64 3.01 8.58 7.18 9.97.52.1.72-.23.72-.5 0-.25-.01-1.08-.02-1.96-2.92.63-3.54-1.24-3.54-1.24-.48-1.21-1.17-1.53-1.17-1.53-.95-.65.07-.64.07-.64 1.05.08 1.61 1.08 1.61 1.08.94 1.6 2.46 1.14 3.06.87.1-.68.37-1.14.67-1.4-2.33-.26-4.78-1.17-4.78-5.18 0-1.14.41-2.08 1.08-2.81-.11-.26-.47-1.33.1-2.77 0 0 .88-.28 2.89 1.08a10.02 10.02 0 0 1 5.26 0c2.01-1.36 2.89-1.08 2.89-1.08.57 1.44.21 2.51.1 2.77.67.73 1.08 1.67 1.08 2.81 0 4.02-2.46 4.92-4.8 5.18.38.33.71.97.71 1.96 0 1.42-.01 2.56-.01 2.91 0 .28.19.61.73.5A10.51 10.51 0 0 0 22.5 12c0-5.8-4.7-10.5-10.5-10.5Z" />
    </svg>
  );
}
