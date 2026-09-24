'use client';

import { Skeleton } from 'boneyard-js/react';
import { useCallback, useState } from 'react';
import { AccountAccessAlert } from '@/components/layout/account-access-alert';
import { DashboardShellSkeleton } from '@/components/layout/dashboard-shell-skeleton';
import { Header } from '@/components/layout/header';
import { Sidebar } from '@/components/layout/sidebar';
import { BrowserNotificationsListener } from '@/components/notifications/browser-notifications-listener';
import { PresenceHeartbeat } from '@/components/presence/presence-heartbeat';
import { AuthProvider, useAuth } from '@/hooks/use-auth';

// Auth-gated dashboard shell. Extracted from the layout so the layout
// itself can stay a server component and export metadata (noindex) —
// client components can't export Next's metadata object.

function DashboardShellInner({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, profileLoading, accountStatusDetail } =
    useAuth();

  // Sidebar drawer state — only used on mobile. On lg+ the sidebar is
  // always visible and this stays at `false` (ignored by the component).
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  const shellLoading =
    loading ||
    Boolean(
      user && !profile && (profileLoading || accountStatusDetail === null)
    );

  if (!shellLoading && !user) return null;

  return (
    <Skeleton
      name="dashboard-shell"
      loading={shellLoading}
      fallback={<DashboardShellSkeleton />}
      color="rgba(127, 127, 127, 0.16)"
      darkColor="rgba(127, 127, 127, 0.16)"
      animate="shimmer"
      transition
      select="viewport"
    >
      {user ? (
        <div className="flex h-screen overflow-hidden bg-background">
          {/* Reports this tab's online/away presence once we know a user is
              signed in. Headless — renders nothing. */}
          <PresenceHeartbeat />
          {/* Desktop alerts for new customer messages (opt-in via Settings →
              Your profile). Headless — renders nothing. */}
          <BrowserNotificationsListener />
          <Sidebar open={sidebarOpen} onClose={closeSidebar} />
          <div className="flex flex-1 flex-col overflow-hidden">
            <Header onOpenSidebar={() => setSidebarOpen(true)} />
            {/* Thinner horizontal padding on mobile so cards have room to breathe. */}
            <main className="flex-1 overflow-y-auto p-4 sm:p-6">
              {/* Above every page: writes are being rejected and here's why.
                  Renders nothing unless the account/role failed to resolve. */}
              <AccountAccessAlert />
              {children}
            </main>
          </div>
        </div>
      ) : null}
    </Skeleton>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <DashboardShellInner>{children}</DashboardShellInner>
    </AuthProvider>
  );
}
