'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { authClient } from '@/lib/auth/client';
import {
  type AccountRole,
  canEditSettings as canEditSettingsFor,
  canManageMembers as canManageMembersFor,
  canSendMessages as canSendMessagesFor,
  isAccountRole,
} from '@/lib/auth/roles';
import { DEFAULT_CURRENCY } from '@/lib/currency';

type BetterAuthUser = NonNullable<
  ReturnType<typeof authClient.useSession>['data']
>['user'];

export interface Profile {
  id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
  account_id: string | null;
  account_role: AccountRole | null;
}

interface AccountSummary {
  id: string;
  name: string;
  default_currency: string;
}

interface AccountPayload {
  profile: Omit<Profile, 'account_role'> & { account_role: string | null };
  account: AccountSummary;
  role: string;
  systemRole: string;
  isSuperadmin: boolean;
}

export type AccountStatus = 'loading' | 'ready' | 'unlinked' | 'error';

interface AuthContextValue {
  user: BetterAuthUser | null;
  profile: Profile | null;
  loading: boolean;
  profileLoading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  accountStatus: AccountStatus;
  accountStatusDetail: string | null;
  accountId: string | null;
  accountRole: AccountRole | null;
  account: AccountSummary | null;
  defaultCurrency: string;
  systemRole: string;
  isSuperadmin: boolean;
  isOwner: boolean;
  isAdmin: boolean;
  isAgent: boolean;
  isViewer: boolean;
  canManageMembers: boolean;
  canEditSettings: boolean;
  canSendMessages: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function readError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    error?: unknown;
  } | null;
  return typeof body?.error === 'string'
    ? body.error
    : `La solicitud falló (${response.status})`;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const session = authClient.useSession();
  const user = session.data?.user ?? null;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [account, setAccount] = useState<AccountSummary | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [statusDetail, setStatusDetail] = useState<string | null>(null);
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);
  const [systemRole, setSystemRole] = useState('user');
  const [isSuperadmin, setIsSuperadmin] = useState(false);

  const fetchProfile = useCallback(async () => {
    if (!user?.id) {
      setProfile(null);
      setAccount(null);
      setLoadedUserId(null);
      setStatusDetail(null);
      setSystemRole('user');
      setIsSuperadmin(false);
      return;
    }

    setProfileLoading(true);
    setStatusDetail(null);
    try {
      const response = await fetch('/api/account', {
        cache: 'no-store',
        credentials: 'include',
      });
      if (!response.ok) throw new Error(await readError(response));

      const payload = (await response.json()) as AccountPayload;
      const accountRole = isAccountRole(payload.profile.account_role)
        ? payload.profile.account_role
        : null;

      setProfile({ ...payload.profile, account_role: accountRole });
      setAccount(payload.account);
      setSystemRole(payload.systemRole || 'user');
      setIsSuperadmin(payload.isSuperadmin === true);
      setLoadedUserId(user.id);
      if (!payload.profile.account_id || !accountRole) {
        setStatusDetail(
          'El perfil no está vinculado a una cuenta o rol válido.'
        );
      }
    } catch (error) {
      setProfile(null);
      setAccount(null);
      setLoadedUserId(user.id);
      setStatusDetail(
        error instanceof Error ? error.message : 'No se pudo cargar la cuenta.'
      );
    } finally {
      setProfileLoading(false);
    }
  }, [user?.id]);

  // Fetch during render only by scheduling a microtask when the authenticated
  // identity changes. This avoids maintaining a second auth subscription:
  // Better Auth's useSession already owns cookie refresh and cross-tab updates.
  if (user?.id && loadedUserId !== user.id && !profileLoading) {
    queueMicrotask(fetchProfile);
  } else if (!user && loadedUserId !== null && !profileLoading) {
    queueMicrotask(fetchProfile);
  }

  const signOut = useCallback(async () => {
    await authClient.signOut();
    window.location.assign('/login');
  }, []);

  const derived = useMemo(() => {
    const role = profile?.account_role ?? null;
    return {
      accountRole: role,
      accountId: profile?.account_id ?? null,
      isOwner: role === 'owner',
      isAdmin: role === 'admin',
      isAgent: role === 'agent',
      isViewer: role === 'viewer',
      canManageMembers: role ? canManageMembersFor(role) : false,
      canEditSettings: role ? canEditSettingsFor(role) : false,
      canSendMessages: role ? canSendMessagesFor(role) : false,
    };
  }, [profile?.account_id, profile?.account_role]);

  const loading = session.isPending;
  const accountStatus: AccountStatus =
    loading || profileLoading
      ? 'loading'
      : !user
        ? 'loading'
        : !profile
          ? 'error'
          : derived.accountId && derived.accountRole
            ? 'ready'
            : 'unlinked';

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      loading,
      profileLoading,
      signOut,
      refreshProfile: fetchProfile,
      accountStatus,
      accountStatusDetail: statusDetail,
      account: account,
      defaultCurrency: account?.default_currency ?? DEFAULT_CURRENCY,
      systemRole,
      isSuperadmin,
      ...derived,
    }),
    [
      account,
      accountStatus,
      derived,
      fetchProfile,
      isSuperadmin,
      loading,
      profile,
      profileLoading,
      signOut,
      statusDetail,
      systemRole,
      user,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

const fallbackValue: AuthContextValue = {
  user: null,
  profile: null,
  loading: false,
  profileLoading: false,
  signOut: async () => {
    window.location.assign('/login');
  },
  refreshProfile: async () => {},
  account: null,
  defaultCurrency: DEFAULT_CURRENCY,
  accountStatus: 'loading',
  accountStatusDetail: null,
  accountId: null,
  accountRole: null,
  systemRole: 'user',
  isSuperadmin: false,
  isOwner: false,
  isAdmin: false,
  isAgent: false,
  isViewer: false,
  canManageMembers: false,
  canEditSettings: false,
  canSendMessages: false,
};

export function useAuth(): AuthContextValue {
  return useContext(AuthContext) ?? fallbackValue;
}
