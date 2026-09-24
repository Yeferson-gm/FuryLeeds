'use client';

import { useState } from 'react';
import type { Contact, MessageTemplate } from '@/types';

export type CustomFieldOperator = 'is' | 'is_not' | 'contains';

export interface CustomFieldFilter {
  fieldId: string;
  operator: CustomFieldOperator;
  value: string;
}

export interface AudienceConfig {
  type: 'all' | 'tags' | 'custom_field' | 'csv';
  tagIds?: string[];
  customField?: CustomFieldFilter;
  csvContacts?: { phone: string; name?: string }[];
  excludeTagIds?: string[];
}

export type VariableMapping =
  | { type: 'static'; value: string }
  | { type: 'field'; value: string }
  | { type: 'custom_field'; value: string };

interface BroadcastPayload {
  name: string;
  template: MessageTemplate;
  audience: AudienceConfig;
  variables: Record<string, VariableMapping>;
  headerMediaUrl?: string;
}

interface UseBroadcastSendingReturn {
  createAndSendBroadcast: (payload: BroadcastPayload) => Promise<string>;
  isProcessing: boolean;
  progress: number;
}

export function resolveVariables(
  variables: Record<string, VariableMapping>,
  contact: Contact,
  customValues?: Map<string, string>
): string[] {
  return Object.keys(variables)
    .sort((a, b) => Number(a) - Number(b) || a.localeCompare(b))
    .map((key) => {
      const variable = variables[key];
      if (variable.type === 'static') return variable.value;
      if (variable.type === 'custom_field') {
        return customValues?.get(variable.value) ?? '';
      }
      const fields: Record<string, string | undefined> = {
        name: contact.name,
        phone: contact.phone,
        email: contact.email,
        company: contact.company,
      };
      return fields[variable.value] ?? '';
    });
}

export function useBroadcastSending(): UseBroadcastSendingReturn {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  async function createAndSendBroadcast(
    payload: BroadcastPayload
  ): Promise<string> {
    setIsProcessing(true);
    setProgress(10);
    try {
      const response = await fetch('/api/whatsapp/broadcast/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'No se pudo crear la difusión');
      }
      const result = await response.json().catch(() => ({}));
      if (typeof result.broadcast_id !== 'string') {
        throw new Error(result.error || 'No se pudo crear la difusión');
      }
      setProgress(100);
      return result.broadcast_id;
    } finally {
      setIsProcessing(false);
    }
  }

  return { createAndSendBroadcast, isProcessing, progress };
}
