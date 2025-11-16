'use client';

import { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

const iconDefaults = {
  width: 18,
  height: 18,
  stroke: 'currentColor',
  fill: 'none',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function IconUndo(props: IconProps) {
  return (
    <svg {...iconDefaults} {...props} viewBox="0 0 24 24">
      <path d="M7 9H4l4-4 4 4H9a7 7 0 1 1-7 7" />
    </svg>
  );
}

export function IconRedo(props: IconProps) {
  return (
    <svg {...iconDefaults} {...props} viewBox="0 0 24 24">
      <path d="M17 9h3l-4-4-4 4h3a7 7 0 1 0 7 7" />
    </svg>
  );
}

export function IconBold(props: IconProps) {
  return (
    <svg {...iconDefaults} {...props} viewBox="0 0 24 24">
      <path d="M7 4h5.5a3.5 3.5 0 0 1 0 7H7z" />
      <path d="M7 11h6a3.5 3.5 0 0 1 0 7H7z" />
    </svg>
  );
}

export function IconItalic(props: IconProps) {
  return (
    <svg {...iconDefaults} {...props} viewBox="0 0 24 24">
      <path d="M10 4h8" />
      <path d="M6 20h8" />
      <path d="M14 4l-4 16" />
    </svg>
  );
}

export function IconUnderline(props: IconProps) {
  return (
    <svg {...iconDefaults} {...props} viewBox="0 0 24 24">
      <path d="M6 4v6a6 6 0 0 0 12 0V4" />
      <path d="M5 20h14" />
    </svg>
  );
}

export function IconStrikethrough(props: IconProps) {
  return (
    <svg {...iconDefaults} {...props} viewBox="0 0 24 24">
      <path d="M5 12h14" />
      <path d="M6 7c0-2 3-3 6-3s6 1 6 3" />
      <path d="M6 17c0 2 3 3 6 3s6-1 6-3" />
    </svg>
  );
}

export function IconBulletList(props: IconProps) {
  return (
    <svg {...iconDefaults} {...props} viewBox="0 0 24 24">
      <path d="M9 6h12" />
      <path d="M9 12h12" />
      <path d="M9 18h12" />
      <circle cx={4} cy={6} r={1.5} fill="currentColor" stroke="none" />
      <circle cx={4} cy={12} r={1.5} fill="currentColor" stroke="none" />
      <circle cx={4} cy={18} r={1.5} fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconNumberList(props: IconProps) {
  return (
    <svg {...iconDefaults} {...props} viewBox="0 0 24 24">
      <path d="M9 6h12" />
      <path d="M9 12h12" />
      <path d="M9 18h12" />
      <path d="M4 4h2v4" />
      <path d="M4 12h3l-2 2 2 2H4" />
      <path d="M4 18h3.5a1.5 1.5 0 0 1 0 3H4" />
    </svg>
  );
}

export function IconAlignLeft(props: IconProps) {
  return (
    <svg {...iconDefaults} {...props} viewBox="0 0 24 24">
      <path d="M4 6h16" />
      <path d="M4 12h10" />
      <path d="M4 18h14" />
    </svg>
  );
}

export function IconAlignCenter(props: IconProps) {
  return (
    <svg {...iconDefaults} {...props} viewBox="0 0 24 24">
      <path d="M4 6h16" />
      <path d="M7 12h10" />
      <path d="M5 18h14" />
    </svg>
  );
}

export function IconAlignRight(props: IconProps) {
  return (
    <svg {...iconDefaults} {...props} viewBox="0 0 24 24">
      <path d="M4 6h16" />
      <path d="M10 12h10" />
      <path d="M6 18h14" />
    </svg>
  );
}

export function IconAlignJustify(props: IconProps) {
  return (
    <svg {...iconDefaults} {...props} viewBox="0 0 24 24">
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h16" />
    </svg>
  );
}

export function IconLink(props: IconProps) {
  return (
    <svg {...iconDefaults} {...props} viewBox="0 0 24 24">
      <path d="M10 13a5 5 0 0 0 7 0l1-1a5 5 0 0 0-7-7l-1 1" />
      <path d="M14 11a5 5 0 0 0-7 0l-1 1a5 5 0 0 0 7 7l1-1" />
    </svg>
  );
}

export function IconSearch(props: IconProps) {
  return (
    <svg {...iconDefaults} {...props} viewBox="0 0 24 24">
      <circle cx={11} cy={11} r={6} />
      <path d="m20 20-3-3" />
    </svg>
  );
}
