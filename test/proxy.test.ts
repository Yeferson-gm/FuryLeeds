import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { NextRequest } from 'next/server';

let mockUser: { id: string } | null = null;

mock.module('@/lib/auth/auth', () => ({
  auth: {
    api: {
      getSession: async () => (mockUser ? { user: mockUser } : null),
    },
  },
}));

const { proxy } = await import('@/proxy');

beforeEach(() => {
  mockUser = null;
  mock.clearAllMocks();
});

describe('proxy de autenticación', () => {
  it('redirige al panel cuando un usuario autenticado abre login', async () => {
    mockUser = { id: 'user-1' };
    const response = await proxy(new NextRequest('https://app.test/login'));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/dashboard');
  });

  it('redirige a login cuando falta sesión en una página protegida', async () => {
    const response = await proxy(
      new NextRequest('https://app.test/dashboard?tab=ventas')
    );
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://app.test/login');
  });

  it('conserva una invitación al redirigir un usuario autenticado', async () => {
    mockUser = { id: 'user-1' };
    const response = await proxy(
      new NextRequest('https://app.test/login?invite=abc123')
    );
    expect(response.headers.get('location')).toContain('/join/abc123');
  });

  it('permite una página protegida con sesión válida', async () => {
    mockUser = { id: 'user-1' };
    const response = await proxy(new NextRequest('https://app.test/dashboard'));
    expect(response.headers.get('location')).toBeNull();
  });
});
