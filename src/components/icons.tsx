import type { ReactNode } from "react";

/** Line icons on a 24×24 grid, drawn in the current text colour. */
function make(children: ReactNode, fill = false) {
  return function Icon({ size = 24, className }: { size?: number; className?: string }) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={fill ? "currentColor" : "none"}
        stroke={fill ? "none" : "currentColor"}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden="true"
      >
        {children}
      </svg>
    );
  };
}

export const IconPower = make(<><path d="M12 3v8" /><path d="M6.4 6.6a8 8 0 1 0 11.2 0" /></>);
export const IconInput = make(<><rect x="3" y="5" width="18" height="12" rx="2" /><path d="M9 21h6M12 17v4" /></>);
export const IconMenu = make(<><path d="M4 7h16M4 12h16M4 17h16" /></>);
export const IconHome = make(<><path d="M4 11l8-7 8 7" /><path d="M6 9.5V20h12V9.5" /></>);
export const IconBack = make(<><path d="M9 14l-5-5 5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></>);
export const IconUp = make(<path d="M6 15l6-6 6 6" />);
export const IconDown = make(<path d="M6 9l6 6 6-6" />);
export const IconLeft = make(<path d="M15 6l-6 6 6 6" />);
export const IconRight = make(<path d="M9 6l6 6-6 6" />);
export const IconPlus = make(<path d="M12 5v14M5 12h14" />);
export const IconMinus = make(<path d="M5 12h14" />);
export const IconMute = make(<><path d="M4 9v6h4l5 4V5L8 9H4z" /><path d="M17 9l4 6M21 9l-4 6" /></>);
export const IconPlay = make(<path d="M8 5.5v13l11-6.5z" />, true);
export const IconPause = make(<path d="M7 5h3.6v14H7zM13.4 5H17v14h-3.6z" />, true);
export const IconRewind = make(<path d="M11 6v12L3 12zM21 6v12l-8-6z" />, true);
export const IconForward = make(<path d="M13 6v12l8-6zM3 6v12l8-6z" />, true);
export const IconKeyboard = make(<><rect x="2.5" y="6" width="19" height="12" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" /></>);
export const IconNumbers = make(<><path d="M5 8h2v8" /><path d="M10 9a2 2 0 0 1 4 0c0 2-4 3-4 7h4" /><path d="M17 8h3l-2 3a2.5 2.5 0 1 1-1.5 4.5" /></>);
export const IconGear = make(<><circle cx="12" cy="12" r="3" /><path d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2L5.5 5.5" /></>);
export const IconClose = make(<path d="M6 6l12 12M18 6L6 18" />);
export const IconTouch = make(<><rect x="4" y="4" width="16" height="16" rx="4" /><circle cx="12" cy="12" r="2.5" /></>);
export const IconPad = make(<><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="3" /></>);
export const IconInfo = make(<><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>);
