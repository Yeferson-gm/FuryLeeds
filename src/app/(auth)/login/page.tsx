'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { AuthPageShell } from '@/components/auth/auth-page-shell';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient } from '@/lib/auth/client';
import { toast } from '@/lib/notifications';

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get('invite');
  const verified = searchParams.get('verified') === 'true';
  const destination = inviteToken
    ? `/join/${encodeURIComponent(inviteToken)}`
    : '/dashboard';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function handleLogin(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    let redirectStarted = false;

    try {
      const result = await authClient.signIn.email({
        email: email.trim(),
        password,
        callbackURL: destination,
      });

      if (result.error) {
        toast.error(result.error.message ?? 'No se pudo iniciar sesión.');
        return;
      }

      window.location.assign(destination);
      redirectStarted = true;
    } catch {
      toast.error('No se pudo iniciar sesión.');
    } finally {
      setLoading((current) => (redirectStarted ? current : false));
    }
  }

  async function handleGoogle() {
    setGoogleLoading(true);
    let redirectStarted = false;
    try {
      const result = await authClient.signIn.social({
        provider: 'google',
        callbackURL: destination,
        errorCallbackURL: `/login?error=google${
          inviteToken ? `&invite=${encodeURIComponent(inviteToken)}` : ''
        }`,
      });
      if (result.error) {
        toast.error(result.error.message ?? 'No se pudo continuar con Google.');
        return;
      }
      redirectStarted = true;
    } catch {
      toast.error('No se pudo continuar con Google.');
    } finally {
      setGoogleLoading((current) => (redirectStarted ? current : false));
    }
  }

  const loginHref = inviteToken
    ? `/login?invite=${encodeURIComponent(inviteToken)}`
    : '/login';
  const signupHref = inviteToken
    ? `/signup?invite=${encodeURIComponent(inviteToken)}`
    : '/signup';

  return (
    <AuthPageShell
      activeSection="login"
      loginHref={loginHref}
      signupHref={signupHref}
    >
      <Card className="w-full rounded-none bg-transparent py-6 shadow-none ring-0">
        <CardHeader className="items-center px-6 pt-2 text-center sm:px-7">
          <CardTitle className="text-2xl font-semibold tracking-tight text-foreground">
            {inviteToken ? 'Inicia sesión para aceptar' : 'Bienvenido de nuevo'}
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            {inviteToken
              ? 'Inicia sesión y te llevaremos a la invitación.'
              : 'Inicia sesión en tu cuenta'}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-6 sm:px-7">
          {verified ? (
            <p className="mb-4 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
              Correo verificado. Ya puedes iniciar sesión.
            </p>
          ) : null}
          {searchParams.get('error') === 'google' ? (
            <p className="mb-4 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              Google no pudo completar el inicio de sesión. Inténtalo de nuevo.
            </p>
          ) : null}

          <Button
            type="button"
            variant="outline"
            className="h-10 w-full bg-background/60"
            onClick={handleGoogle}
            disabled={loading || googleLoading}
          >
            <span aria-hidden className="text-base font-semibold">
              G
            </span>
            {googleLoading ? 'Conectando…' : 'Continuar con Google'}
          </Button>

          <div className="my-5 flex items-center gap-3" aria-hidden>
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              o con correo
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Correo electrónico</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Contraseña</Label>
                <Link
                  href="/forgot-password"
                  className="text-sm text-primary hover:text-primary/80"
                >
                  ¿Olvidaste tu contraseña?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="Ingresa tu contraseña"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>

            <Button
              type="submit"
              className="h-10 bg-foreground text-background hover:bg-foreground/90"
              disabled={loading || googleLoading}
            >
              {loading ? 'Iniciando sesión…' : 'Iniciar sesión'}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            ¿No tienes una cuenta?{' '}
            <Link
              href={signupHref}
              className="font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
            >
              Crear cuenta
            </Link>
          </p>
        </CardContent>
      </Card>
    </AuthPageShell>
  );
}
