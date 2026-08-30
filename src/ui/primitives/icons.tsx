/**
 * Hand-authored inline icons.
 *
 * No icon library and no emoji: the set is small enough that a dependency
 * would cost more than it saves, and every glyph is drawn on the same 24-unit
 * grid with a 1.75 stroke so they read as one family. They inherit
 * `currentColor` and size (1em) from whatever control holds them.
 */

import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

const base = (props: IconProps): SVGProps<SVGSVGElement> => ({
  viewBox: '0 0 24 24',
  width: '1em',
  height: '1em',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
  ...props,
});

/** Undo / redo: one turning arrow, mirrored rather than redrawn. */
export const UndoIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M4 10h10a5 5 0 0 1 0 10h-4" />
    <path d="M8 6 4 10l4 4" />
  </svg>
);

export const RedoIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M20 10H10a5 5 0 0 0 0 10h4" />
    <path d="m16 6 4 4-4 4" />
  </svg>
);

/** Eraser: a block dragged along a baseline. */
export const EraserIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="m10 19 9-9-5-5-9 9a2 2 0 0 0 0 3l2 2Z" />
    <path d="M6.5 15.5 11 20" />
    <path d="M11 20h9" />
  </svg>
);

/** Pencil-mark mode: a nib. */
export const PencilIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M15.5 4.5 19 8 9.5 17.5 5 19l1.5-4.5Z" />
    <path d="m14 6 3.5 3.5" />
  </svg>
);

export const CheckIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);

export const CloseIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="m6 6 12 12M18 6 6 18" />
  </svg>
);

/** Resume: a play triangle, open-stroked so it still reads at 16px. */
export const PlayIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M8 5.5v13l11-6.5Z" />
  </svg>
);

export const PlusIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

/** Escalate: a chevron pointing down to the next rung of the ladder. */
export const ChevronDownIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

/** Candidate-review issue marker — pairs with text, never colour alone. */
export const AlertIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M12 4 2.5 20h19L12 4Z" />
    <path d="M12 10v4M12 17.2v.1" />
  </svg>
);

export const SunIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
  </svg>
);

export const MoonIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
  </svg>
);

export const ChevronLeftIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="m15 5-7 7 7 7" />
  </svg>
);

/** Settings: a slider bank, not a cog — this app has preferences, not machinery. */
export const SettingsIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M4 8h10M18 8h2M4 16h4M12 16h8" />
    <circle cx="16" cy="8" r="2" />
    <circle cx="10" cy="16" r="2" />
  </svg>
);

export const TrashIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" />
  </svg>
);

/** Pause and play for the game clock, drawn to the same weight as the rest. */
export const PauseIcon = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M9 6v12M15 6v12" />
  </svg>
);
