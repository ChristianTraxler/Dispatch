// Docket line icons (1.7px stroke on a 24px box). Sized by CSS; every one
// renders as a block so it sits dead center in its button.

import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Svg({ children, strokeWidth = 1.7, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ display: "block" }}
      {...rest}
    >
      {children}
    </svg>
  );
}

export const LedgerIcon = (p: IconProps) => (
  <Svg {...p}><path d="M5 3h11l3 3v15H5z" /><path d="M9 9h6M9 13h6M9 17h4" /></Svg>
);
export const InquiriesIcon = (p: IconProps) => (
  <Svg {...p}><path d="M20 11.5a8 8 0 0 1-11.6 7.1L4 20l1.4-4.2A8 8 0 1 1 20 11.5z" /></Svg>
);
export const ClientsIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20c1-3.5 3.5-5.5 6.5-5.5s5.5 2 6.5 5.5" />
    <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c1.7.8 2.9 2.6 3.5 5.2" />
  </Svg>
);
export const InvitesIcon = (p: IconProps) => (
  <Svg {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3.5 6.5 8.5 6.5 8.5-6.5" /></Svg>
);
export const AddOnsIcon = (p: IconProps) => (
  <Svg {...p}><rect x="3.5" y="3.5" width="17" height="17" rx="4" /><path d="M12 8v8M8 12h8" /></Svg>
);
export const TrashIcon = (p: IconProps) => (
  <Svg {...p}><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" /></Svg>
);
export const BackIcon = (p: IconProps) => (
  <Svg strokeWidth={1.8} {...p}><path d="M19 12H5M11 6l-6 6 6 6" /></Svg>
);
export const ArrowIcon = (p: IconProps) => (
  <Svg strokeWidth={1.8} {...p}><path d="M5 12h14M13 6l6 6-6 6" /></Svg>
);
export const PlusIcon = (p: IconProps) => (
  <Svg strokeWidth={2} {...p}><path d="M12 5v14M5 12h14" /></Svg>
);
export const ChevronIcon = (p: IconProps) => (
  <Svg strokeWidth={2} {...p}><path d="m6 9 6 6 6-6" /></Svg>
);
export const XIcon = (p: IconProps) => (
  <Svg strokeWidth={2.2} {...p}><path d="M6 6l12 12M18 6 6 18" /></Svg>
);
export const InboxIcon = (p: IconProps) => (
  <Svg strokeWidth={1.6} {...p}><path d="M3 13h5l2 3h4l2-3h5" /><path d="M5.5 5h13L21 13v6H3v-6z" /></Svg>
);
export const AccountIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21c1.2-4 4.2-6 8-6s6.8 2 8 6" /></Svg>
);
export const SignOutIcon = (p: IconProps) => (
  <Svg {...p}><path d="M10 4H5v16h5" /><path d="M14 8l4 4-4 4M18 12H9" /></Svg>
);
export const UpIcon = (p: IconProps) => (
  <Svg strokeWidth={2} {...p}><path d="M12 19V5" /><path d="m5 12 7-7 7 7" /></Svg>
);
