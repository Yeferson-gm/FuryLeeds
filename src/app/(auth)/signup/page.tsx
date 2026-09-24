'use client';

import { CheckCircle } from 'lucide-react';
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

const MIN_PASSWORD = 8;

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupPageInner />
    </Suspense>
  );
}

function SignupPageInner() {
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get('invite');
  const callbackURL = inviteToken
    ? `/join/${encodeURIComponent(inviteToken)}`
    : '/login?verified=true';
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const loginHref = inviteToken
    ? `/login?invite=${encodeURIComponent(inviteToken)}`
    : '/login';
  const signupHref = inviteToken
    ? `/signup?invite=${encodeURIComponent(inviteToken)}`
    : '/signup';

  async function handleSignup(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    if (password.length < MIN_PASSWORD) {
      setError(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`);
      return;
    }

    setLoading(true);
    try {
      const result = await authClient.signUp.email({
        name: fullName.trim(),
        email: email.trim(),
        password,
        callbackURL,
      });

      if (result.error) {
        setError(result.error.message ?? 'No se pudo crear la cuenta.');
        return;
      }

      setSuccess(true);
    } catch {
      setError('No se pudo crear la cuenta.');
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setError(null);
    setGoogleLoading(true);
    let redirectStarted = false;
    try {
      const result = await authClient.signIn.social({
        provider: 'google',
        callbackURL: inviteToken
          ? `/join/${encodeURIComponent(inviteToken)}`
          : '/dashboard',
        errorCallbackURL: `/signup?error=google${
          inviteToken ? `&invite=${encodeURIComponent(inviteToken)}` : ''
        }`,
      });
      if (result.error) {
        setError(result.error.message ?? 'No se pudo continuar con Google.');
        return;
      }
      redirectStarted = true;
    } catch {
      setError('No se pudo continuar con Google.');
    } finally {
      setGoogleLoading((current) => (redirectStarted ? current : false));
    }
  }

  if (success) {
    return (
      <AuthPageShell>
        <Card className="w-full rounded-none bg-transparent py-6 shadow-none ring-0">
          <CardHeader className="items-start px-6 text-left sm:px-7">
            <div className="mb-3 flex size-10 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10">
              <CheckCircle className="size-5 text-emerald-400" />
            </div>
            <CardTitle className="text-xl">Revisa tu correo</CardTitle>
            <CardDescription>
              Revisa la bandeja de{' '}
              <span className="text-foreground">{email}</span> y abre el enlace
              de verificación para activar tu cuenta.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-6 sm:px-7">
            <Link href={loginHref}>
              <Button
                variant="outline"
                className="h-10 w-full bg-background/60"
              >
                Volver a iniciar sesión
              </Button>
            </Link>
          </CardContent>
        </Card>
      </AuthPageShell>
    );
  }

  return (
    <AuthPageShell
      activeSection="signup"
      loginHref={loginHref}
      signupHref={signupHref}
    >
      <Card className="w-full rounded-none bg-transparent py-6 shadow-none ring-0">
        <CardHeader className="items-center px-6 pt-2 text-center sm:px-7">
          <CardTitle className="text-2xl font-semibold tracking-tight">
            {inviteToken ? 'Crear cuenta y unirse' : 'Crear cuenta'}
          </CardTitle>
          <CardDescription>
            {inviteToken
              ? 'Verifica tu correo y luego acepta la invitación.'
              : 'Empieza a usar el CRM para WhatsApp.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-6 sm:px-7">
          {searchParams.get('error') === 'google' ? (
            <p className="mb-4 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              Google no pudo completar el registro. Inténtalo de nuevo.
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
            {googleLoading ? 'Conectando…' : 'Registrarse con Google'}
          </Button>

          <div className="my-5 flex items-center gap-3" aria-hidden>
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              o con correo
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={handleSignup} className="flex flex-col gap-4">
            {error ? (
              <div
                role="alert"
                className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive"
              >
                {error}
              </div>
            ) : null}

            <div className="flex flex-col gap-2">
              <Label htmlFor="fullName">Nombre completo</Label>
              <Input
                id="fullName"
                autoComplete="name"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                maxLength={120}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Correo electrónico</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={MIN_PASSWORD}
                placeholder={`Al menos ${MIN_PASSWORD} caracteres`}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="confirmPassword">Confirmar contraseña</Label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                minLength={MIN_PASSWORD}
                required
              />
            </div>
            <Button
              type="submit"
              className="h-10 bg-foreground text-background hover:bg-foreground/90"
              disabled={loading || googleLoading}
            >
              {loading ? 'Creando cuenta…' : 'Crear cuenta'}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            ¿Ya tienes una cuenta?{' '}
            <Link
              href={loginHref}
              className="font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
            >
              Iniciar sesión
            </Link>
          </p>
        </CardContent>
      </Card>
    </AuthPageShell>
  );
}
