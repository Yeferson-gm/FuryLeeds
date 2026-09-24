'use client';

import { Moon, Sun } from 'lucide-react';
import {
  type ComponentPropsWithoutRef,
  type MouseEvent,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import { flushSync } from 'react-dom';

import type { Mode } from '@/lib/themes';
import { cn } from '@/lib/utils';

type ViewTransition = {
  ready: Promise<void>;
  finished: Promise<void>;
};

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => ViewTransition;
};

type ViewTransitionAnimationOptions = KeyframeAnimationOptions & {
  pseudoElement: string;
};

interface AnimatedThemeTogglerProps
  extends Omit<ComponentPropsWithoutRef<'button'>, 'onClick'> {
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  targetMode?: Mode;
  duration?: number;
}

const TRANSITION_STATE_ATTRIBUTE = 'furyleedsModeTransition';
const TRANSITION_DURATION_PROPERTY = '--furyleeds-mode-transition-duration';
const TRANSITION_CLIP_PROPERTY = '--furyleeds-mode-transition-clip-from';

function clearTransitionState(root: HTMLElement) {
  delete root.dataset[TRANSITION_STATE_ATTRIBUTE];
  root.style.removeProperty(TRANSITION_DURATION_PROPERTY);
  root.style.removeProperty(TRANSITION_CLIP_PROPERTY);
}

/**
 * Light/dark control adapted from Magic UI's Animated Theme Toggler.
 * FuryLeeds keeps persistence in ThemeProvider, while this primitive owns only
 * the View Transitions reveal and its progressive-enhancement fallback.
 */
export function AnimatedThemeToggler({
  mode,
  onModeChange,
  targetMode,
  duration = 450,
  className,
  children,
  disabled,
  ...props
}: AnimatedThemeTogglerProps) {
  const activeAnimationRef = useRef<Animation | null>(null);
  const isTransitioningRef = useRef(false);

  const cancelActiveAnimation = useCallback(() => {
    activeAnimationRef.current?.cancel();
    activeAnimationRef.current = null;
  }, []);

  useEffect(() => {
    return function cleanUpThemeTransition() {
      cancelActiveAnimation();
      const root = document.documentElement;
      if (root.dataset[TRANSITION_STATE_ATTRIBUTE] === 'active') {
        clearTransitionState(root);
      }
    };
  }, [cancelActiveAnimation]);

  const handleClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      const nextMode = targetMode ?? (mode === 'dark' ? 'light' : 'dark');
      const root = document.documentElement;

      if (
        nextMode === mode ||
        isTransitioningRef.current ||
        root.dataset[TRANSITION_STATE_ATTRIBUTE] === 'active'
      ) {
        return;
      }

      const applyMode = () => onModeChange(nextMode);
      const reduceMotion = window.matchMedia(
        '(prefers-reduced-motion: reduce)'
      ).matches;
      const viewTransitionDocument = document as ViewTransitionDocument;

      if (!viewTransitionDocument.startViewTransition || reduceMotion) {
        applyMode();
        return;
      }

      const { left, top, width, height } =
        event.currentTarget.getBoundingClientRect();
      const x = left + width / 2;
      const y = top + height / 2;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const maxRadius = Math.hypot(
        Math.max(x, viewportWidth - x),
        Math.max(y, viewportHeight - y)
      );
      const point = `${(x / viewportWidth) * 100}% ${(y / viewportHeight) * 100}%`;
      const radius = `${
        (maxRadius / (Math.hypot(viewportWidth, viewportHeight) / Math.SQRT2)) *
        100
      }%`;
      const clipPath = [
        `circle(0% at ${point})`,
        `circle(${radius} at ${point})`,
      ];

      root.dataset[TRANSITION_STATE_ATTRIBUTE] = 'active';
      root.style.setProperty(TRANSITION_DURATION_PROPERTY, `${duration}ms`);
      root.style.setProperty(TRANSITION_CLIP_PROPERTY, clipPath[0]);
      isTransitioningRef.current = true;

      const cleanUp = () => {
        isTransitioningRef.current = false;
        clearTransitionState(root);
        cancelActiveAnimation();
      };

      const transition = viewTransitionDocument.startViewTransition(() => {
        flushSync(applyMode);
      });

      transition.finished.finally(cleanUp).catch(() => {});
      transition.ready
        .then(() => {
          activeAnimationRef.current = root.animate({ clipPath }, {
            duration,
            easing: 'ease-in-out',
            fill: 'forwards',
            pseudoElement: '::view-transition-new(root)',
          } as ViewTransitionAnimationOptions);
        })
        .catch(() => {});
    },
    [cancelActiveAnimation, duration, mode, onModeChange, targetMode]
  );

  const destinationMode = targetMode ?? (mode === 'dark' ? 'light' : 'dark');

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className={cn(className)}
      {...props}
    >
      {children ??
        (destinationMode === 'light' ? (
          <Sun className="size-5" />
        ) : (
          <Moon className="size-5" />
        ))}
    </button>
  );
}
