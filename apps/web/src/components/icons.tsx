import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 20, children, ...rest }: P & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...rest}>
      {children}
    </svg>
  );
}

export const IconSearch = (p: P) => (<Svg {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Svg>);
export const IconHeart = ({ filled, ...p }: P & { filled?: boolean }) => (
  <Svg {...p} fill={filled ? "currentColor" : "none"}><path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 8 3.6 4.5 7 4.5c2 0 3.4 1.1 5 3 1.6-1.9 3-3 5-3 3.4 0 5.6 3.5 4.3 6.8-1.8 4.6-9.3 9.2-9.3 9.2Z" /></Svg>
);
export const IconX = (p: P) => (<Svg {...p}><path d="M18 6 6 18M6 6l12 12" /></Svg>);
export const IconPlus = (p: P) => (<Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>);
export const IconUser = (p: P) => (<Svg {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" /></Svg>);
export const IconFilter = (p: P) => (<Svg {...p}><path d="M4 6h16M7 12h10M10 18h4" /></Svg>);
export const IconChevronLeft = (p: P) => (<Svg {...p}><path d="m15 18-6-6 6-6" /></Svg>);
export const IconChevronRight = (p: P) => (<Svg {...p}><path d="m9 18 6-6-6-6" /></Svg>);
export const IconChevronDown = (p: P) => (<Svg {...p}><path d="m6 9 6 6 6-6" /></Svg>);
export const IconArrowUp = (p: P) => (<Svg {...p}><path d="M12 19V5M5 12l7-7 7 7" /></Svg>);
export const IconArrowDown = (p: P) => (<Svg {...p}><path d="M12 5v14M19 12l-7 7-7-7" /></Svg>);
export const IconPhone = (p: P) => (<Svg {...p}><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" /></Svg>);
export const IconPin = (p: P) => (<Svg {...p}><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.5" /></Svg>);
export const IconCamera = (p: P) => (<Svg {...p}><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></Svg>);
export const IconExpand = (p: P) => (<Svg {...p}><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></Svg>);
export const IconEye = (p: P) => (<Svg {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></Svg>);
export const IconList = (p: P) => (<Svg {...p}><path d="M4 6h16M4 12h16M4 18h16" /></Svg>);
export const IconGrid = (p: P) => (<Svg {...p}><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></Svg>);

export function CategoryIcon({ icon, size = 28 }: { icon: string; size?: number }) {
  switch (icon) {
    case "car":
      return (<Svg size={size}><path d="M3 13l2-5.5A2 2 0 0 1 6.9 6h10.2a2 2 0 0 1 1.9 1.5L21 13v4a1 1 0 0 1-1 1h-1.5M3 13v4a1 1 0 0 0 1 1h1.5M3 13h18M8.5 18h7" /><circle cx="7" cy="17.5" r="1.8" /><circle cx="17" cy="17.5" r="1.8" /></Svg>);
    case "motorcycle":
      return (<Svg size={size}><circle cx="5.5" cy="16" r="3.5" /><circle cx="18.5" cy="16" r="3.5" /><path d="M5.5 16 9 10h5l4.5 6M14 10l-1.5-3H10M14 10h3l1.5-2" /></Svg>);
    case "scooter":
      return (<Svg size={size}><circle cx="6" cy="17" r="2.5" /><circle cx="18" cy="17" r="2.5" /><path d="M8.5 17H15l2-8h2M17 9l-1-3h-2M3.5 17V13h7l1 4" /></Svg>);
    case "apartment":
      return (<Svg size={size}><path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 10h4a1 1 0 0 1 1 1v10M2 21h20M8 8h3M8 12h3M8 16h3" /></Svg>);
    default:
      return (<Svg size={size}><rect x="4" y="4" width="16" height="16" rx="3" /></Svg>);
  }
}

export const IconChat = (p: P) => (<Svg {...p}><path d="M4 5h16v11H9l-5 4z" /></Svg>);
export const IconBell = (p: P) => (<Svg {...p}><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0" /></Svg>);
export const IconFlag = (p: P) => (<Svg {...p}><path d="M5 21V4M5 4h11l-2 4 2 4H5" /></Svg>);
export const IconSend = (p: P) => (<Svg {...p}><path d="M4 12 20 4l-5 16-3-7z" /></Svg>);
export const IconCheck = (p: P) => (<Svg {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></Svg>);
export const IconBookmark = (p: P) => (<Svg {...p}><path d="M6 3h12v18l-6-4.5L6 21z" /></Svg>);
export const IconShield = (p: P) => (<Svg {...p}><path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z" /></Svg>);
export const IconTrendDown = (p: P) => (<Svg {...p}><path d="m3 7 6 6 4-4 8 8M21 11v6h-6" /></Svg>);
export const IconGlobe = (p: P) => (<Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z" /></Svg>);
export const IconInfo = (p: P) => (<Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.6v.1" /></Svg>);
export const IconTag = (p: P) => (<Svg {...p}><path d="M3 12V4h8l10 10-8 8z" /><circle cx="7.5" cy="8.5" r="1.3" /></Svg>);
export const IconLayout = (p: P) => (<Svg {...p}><rect x="3" y="4" width="18" height="16" rx="1.5" /><path d="M11 4v9M11 13h10M7 20v-4" /></Svg>);
export const IconCheckDouble = (p: P) => (<Svg {...p}><path d="m2 12.5 4.5 4.5L15 8.5M11 16l1 1 9.5-9.5" /></Svg>);
export const IconArrowLeft = (p: P) => (<Svg {...p}><path d="M19 12H5M12 19l-7-7 7-7" /></Svg>);
export const IconTrash = (p: P) => (<Svg {...p}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></Svg>);
export const IconLightbulb = (p: P) => (<Svg {...p}><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3Z" /></Svg>);
export const IconLanguage = (p: P) => (<Svg {...p}><path d="M4 5h9M8.5 3v2M6 5c.5 3 2.5 6 6 7.5M11 5c-.6 3.5-3 6.5-7 8M13 21l4-9 4 9M14.3 18h5.4" /></Svg>);
