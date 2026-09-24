'use client';

import { ArrowLeft, CheckCircle, KeyRound, MessageSquare } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
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

const MIN_PASSWORD = 8;

type RecoveryStep = 'request' | 'reset' | 'success';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [step, setStep] = useState<RecoveryStep>('request');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function requestCode(options?: { resend?: boolean }) {
    const resend = options?.resend === true;
    if (resend) setResending(true);
    else setLoading(true);

    try {
      const result = await authClient.emailOtp.requestPasswordReset({
        email: email.trim(),
      });

      if (result.error) {
        toast.error('No se pudo enviar el código. Inténtalo de nuevo.');
        return;
      }

      setError(null);
      setStep('reset');
      if (resend) {
        toast.success('Si la cuenta existe, enviamos un código nuevo.');
      }
    } catch {
      toast.error('No se pudo enviar el código. Inténtalo de nuevo.');
    } finally {
      setLoading(false);
      setResending(false);
    }
  }

  async function handleRequest(event: React.FormEvent) {
    event.preventDefault();
    await requestCode();
  }

  async function handleReset(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!/^\d{6}$/.test(otp)) {
      setError('Ingresa el código de 6 dígitos que recibiste por correo.');
      return;
    }
    if (password.length < MIN_PASSWORD) {
      setError(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`);
      return;
    }
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);
    try {
      const result = await authClient.emailOtp.resetPassword({
        email: email.trim(),
        otp,
        password,
      });

      if (result.error) {
        setError(
          'El código es inválido o ya venció. Compruébalo o solicita uno nuevo.'
        );
        return;
      }

      setOtp('');
      setPassword('');
      setConfirmPassword('');
      setStep('success');
    } catch {
      setError(
        'No se pudo restablecer la contraseña. Inténtalo de nuevo o solicita otro código.'
      );
    } finally {
      setLoading(false);
    }
  }

  if (step === 'success') {
    return (
      <AuthPageShell>
        <Card className="w-full rounded-none bg-transparent py-6 shadow-none ring-0">
          <CardHeader className="items-start px-6 text-left sm:px-7">
            <div className="mb-3 flex size-10 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10">
              <CheckCircle className="size-5 text-emerald-400" />
            </div>
            <CardTitle className="text-xl">
              Contraseña recuperada correctamente
            </CardTitle>
            <CardDescription>
              Ya puedes entrar a FuryLeeds con tu nueva contraseña.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-6 sm:px-7">
            <Link href="/login">
              <Button className="h-10 w-full bg-foreground text-background hover:bg-foreground/90">
                Iniciar sesión
              </Button>
            </Link>
          </CardContent>
        </Card>
      </AuthPageShell>
    );
  }

  if (step === 'reset') {
    return (
      <AuthPageShell>
        <Card className="w-full rounded-none bg-transparent py-6 shadow-none ring-0">
          <CardHeader className="items-start px-6 text-left sm:px-7">
            <div className="mb-3 flex size-10 items-center justify-center rounded-lg border border-border bg-background/70">
              <KeyRound className="size-5 text-foreground" />
            </div>
            <CardTitle className="text-xl">Ingresa el código</CardTitle>
            <CardDescription>
              Si existe una cuenta para{' '}
              <span className="text-foreground">{email}</span>, enviamos un
              código de 6 dígitos. Caduca en 10 minutos.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-6 sm:px-7">
            <form onSubmit={handleReset} className="flex flex-col gap-4">
              {error ? (
                <p
                  id="recovery-error"
                  role="alert"
                  className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  {error}
                </p>
              ) : null}
              <div className="flex flex-col gap-2">
                <Label htmlFor="recovery-code">Código de recuperación</Label>
                <Input
                  id="recovery-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={otp}
                  onChange={(event) =>
                    setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))
                  }
                  aria-describedby={error ? 'recovery-error' : undefined}
                  className="text-center text-lg tracking-[0.35em]"
                  disabled={loading}
                  required
                  autoFocus
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="new-password">Nueva contraseña</Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={MIN_PASSWORD}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={loading}
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="confirm-password">Confirmar contraseña</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={MIN_PASSWORD}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  disabled={loading}
                  required
                />
              </div>
              <Button
                type="submit"
                className="h-10 bg-foreground text-background hover:bg-foreground/90"
                disabled={loading || resending}
              >
                {loading ? 'Actualizando…' : 'Actualizar contraseña'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={loading || resending}
                onClick={() => requestCode({ resend: true })}
              >
                {resending ? 'Reenviando…' : 'Reenviar código'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </AuthPageShell>
    );
  }

  return (
    <AuthPageShell>
      <Card className="w-full rounded-none bg-transparent py-6 shadow-none ring-0">
        <CardHeader className="items-start px-6 text-left sm:px-7">
          <div className="mb-3 flex size-10 items-center justify-center rounded-lg border border-border bg-background/70">
            <MessageSquare className="size-5 text-foreground" />
          </div>
          <CardTitle className="text-xl">Recuperar contraseña</CardTitle>
          <CardDescription>
            Ingresa tu correo y te enviaremos un código seguro de 6 dígitos.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-6 sm:px-7">
          <form onSubmit={handleRequest} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Correo electrónico</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={loading}
                required
              />
            </div>
            <Button
              type="submit"
              className="h-10 bg-foreground text-background hover:bg-foreground/90"
              disabled={loading}
            >
              {loading ? 'Enviando…' : 'Enviar código de recuperación'}
            </Button>
          </form>
          <Link
            href="/login"
            className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver a iniciar sesión
          </Link>
        </CardContent>
      </Card>
    </AuthPageShell>
  );
}
