import { twMerge } from 'tailwind-merge';

type ClassDictionary = Record<string, boolean | null | undefined>;
type ClassArray = ClassValue[];
type ClassNameCallback = (...args: never[]) => string | undefined;

export type ClassValue =
  | string
  | number
  | false
  | null
  | undefined
  | ClassDictionary
  | ClassArray;

type ClassNameValue = ClassValue | ClassNameCallback;

function stringifyClassValue(value: ClassNameValue): string {
  if (!value) {
    return '';
  }

  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map(stringifyClassValue).filter(Boolean).join(' ');
  }

  return Object.entries(value)
    .filter(([, enabled]) => enabled)
    .map(([className]) => className)
    .join(' ');
}

export function cn(...inputs: ClassNameValue[]) {
  return twMerge(inputs.map(stringifyClassValue).filter(Boolean).join(' '));
}
