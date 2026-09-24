import type { Mock } from 'bun:test';

type GlobalKey = keyof typeof globalThis;

const originalGlobals = new Map<PropertyKey, PropertyDescriptor | undefined>();
const originalEnv = new Map<string, string | undefined>();

export function hoisted<T>(factory: () => T): T {
  return factory();
}

export function mocked<T extends (...args: never[]) => unknown>(
  value: T
): Mock<T> {
  return value as unknown as Mock<T>;
}

export function required<T>(
  value: T | null | undefined,
  message = 'Expected value to be defined'
): T {
  if (value == null) throw new Error(message);
  return value;
}

export function asThenable<T extends object, TResult>(
  target: T,
  getResult: () => TResult | PromiseLike<TResult>
): T & PromiseLike<TResult> {
  const then: PromiseLike<TResult>['then'] = (onFulfilled, onRejected) =>
    Promise.resolve().then(getResult).then(onFulfilled, onRejected);
  Object.defineProperty(target, 'then', {
    configurable: true,
    value: then,
  });
  return target as T & PromiseLike<TResult>;
}

export function stubGlobal<K extends GlobalKey>(
  key: K,
  value: (typeof globalThis)[K]
): void;
export function stubGlobal(key: PropertyKey, value: unknown): void;
export function stubGlobal(key: PropertyKey, value: unknown): void {
  if (!originalGlobals.has(key)) {
    originalGlobals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  }
  Object.defineProperty(globalThis, key, {
    configurable: true,
    writable: true,
    value,
  });
}

export function unstubAllGlobals(): void {
  for (const [key, descriptor] of originalGlobals) {
    if (descriptor) {
      Object.defineProperty(globalThis, key, descriptor);
    } else {
      Reflect.deleteProperty(globalThis, key);
    }
  }
  originalGlobals.clear();
}

export function stubEnv(key: string, value: string | undefined): void {
  if (!originalEnv.has(key)) originalEnv.set(key, process.env[key]);
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

export function unstubAllEnvs(): void {
  for (const [key, value] of originalEnv) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  originalEnv.clear();
}
