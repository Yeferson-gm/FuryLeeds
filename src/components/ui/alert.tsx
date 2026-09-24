import type * as React from 'react';

import { type ClassValue, cn } from '@/lib/utils';

const alertVariantClasses = {
  default: 'bg-card text-card-foreground',
  destructive:
    'bg-card text-destructive *:data-[slot=alert-description]:text-destructive/90 *:[svg]:text-current',
} as const;

type AlertVariantProps = {
  variant?: keyof typeof alertVariantClasses | null;
};

type AlertVariantOptions = AlertVariantProps & {
  className?: ClassValue;
};

function alertVariants({
  variant = 'default',
  className,
}: AlertVariantOptions = {}) {
  return cn(
    "group/alert relative grid w-full gap-0.5 rounded-lg border px-2.5 py-2 text-left text-sm has-data-[slot=alert-action]:relative has-data-[slot=alert-action]:pr-18 has-[>svg]:grid-cols-[auto_1fr] has-[>svg]:gap-x-2 *:[svg]:row-span-2 *:[svg]:translate-y-0.5 *:[svg]:text-current *:[svg:not([class*='size-'])]:size-4",
    variant && alertVariantClasses[variant],
    className
  );
}

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<'div'> & AlertVariantProps) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-title"
      className={cn(
        'font-heading font-medium group-has-[>svg]/alert:col-start-2 [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground',
        className
      )}
      {...props}
    />
  );
}

function AlertDescription({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        'text-sm text-balance text-muted-foreground md:text-pretty [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground [&_p:not(:last-child)]:mb-4',
        className
      )}
      {...props}
    />
  );
}

function AlertAction({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-action"
      className={cn('absolute top-2 right-2', className)}
      {...props}
    />
  );
}

export { Alert, AlertAction, AlertDescription, AlertTitle };
