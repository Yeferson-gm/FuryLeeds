'use client';

import { AnimatedThemeToggler } from '@/components/ui/animated-theme-toggler';
import { useTheme } from '@/hooks/use-theme';
import { cn } from '@/lib/utils';

const _COPY = {
  switchMode: 'Cambiar al modo {mode}',
} as const;

/**
 * Light/dark mode toggle — a single icon button that flips the app
 * between the two modes. The icon and accessible label name the destination;
 * the new palette expands from the button when View Transitions are available.
 *
 * 40×40 hit target to match the header's other touch controls.
 */
export function ModeToggle({ className }: { className?: string }) {
  const { mode, setMode } = useTheme();
  const targetMode = mode === 'dark' ? 'claro' : 'oscuro';
  const switchLabel = `Cambiar al modo ${targetMode}`;

  return (
    <AnimatedThemeToggler
      mode={mode}
      onModeChange={setMode}
      aria-label={switchLabel}
      title={switchLabel}
      className={cn(
        'flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
        className
      )}
    />
  );
}
