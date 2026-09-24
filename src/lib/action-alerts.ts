'use client';

import type { SweetAlertIcon, SweetAlertOptions } from 'sweetalert2';
import { toast } from '@/lib/notifications';

const ACTION_ALERT_CLASSES: SweetAlertOptions['customClass'] = {
  container: 'furyleeds-action-alert',
  popup: 'furyleeds-action-alert__popup',
  title: 'furyleeds-action-alert__title',
  htmlContainer: 'furyleeds-action-alert__content',
  actions: 'furyleeds-action-alert__actions',
  confirmButton: 'furyleeds-action-alert__confirm',
  cancelButton: 'furyleeds-action-alert__cancel',
  denyButton: 'furyleeds-action-alert__deny',
};

interface ConfirmActionOptions {
  title: string;
  text: string;
  confirmText: string;
  cancelText?: string;
  icon?: SweetAlertIcon;
  destructive?: boolean;
}

async function loadSweetAlert() {
  const { default: Swal } = await import('sweetalert2');
  return Swal;
}

/** Opens a blocking confirmation only after a user-triggered action. */
export async function confirmAction({
  title,
  text,
  confirmText,
  cancelText = 'Cancelar',
  icon = 'question',
  destructive = false,
}: ConfirmActionOptions): Promise<boolean> {
  const Swal = await loadSweetAlert();
  const result = await Swal.fire({
    title,
    text,
    icon,
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: cancelText,
    focusCancel: destructive,
    reverseButtons: true,
    customClass: ACTION_ALERT_CLASSES,
    buttonsStyling: false,
    heightAuto: false,
  });

  return result.isConfirmed;
}

export async function confirmDestructiveAction(
  options: Omit<ConfirmActionOptions, 'destructive' | 'icon'>
): Promise<boolean> {
  return confirmAction({
    ...options,
    destructive: true,
    icon: 'warning',
  });
}

export function confirmSignOut(): Promise<boolean> {
  return confirmAction({
    title: '¿Cerrar sesión?',
    text: 'Tendrás que volver a identificarte para acceder a tu cuenta.',
    confirmText: 'Cerrar sesión',
    cancelText: 'Permanecer aquí',
    icon: 'question',
  });
}

interface OneTimeSecretOptions {
  title: string;
  description: string;
  secret: string;
  copyLabel?: string;
  copiedMessage?: string;
  copyFailedMessage?: string;
  confirmText?: string;
}

function createSecretContent(
  secret: string,
  copyLabel: string,
  copiedMessage: string,
  copyFailedMessage: string
): { container: HTMLDivElement; clear: () => void } {
  const container = document.createElement('div');
  container.className = 'furyleeds-secret-reveal';

  const value = document.createElement('code');
  value.className = 'furyleeds-secret-reveal__value';
  value.textContent = secret;

  const copyButton = document.createElement('button');
  copyButton.type = 'button';
  copyButton.className = 'furyleeds-secret-reveal__copy';
  copyButton.textContent = copyLabel;
  copyButton.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(secret);
      toast.success(copiedMessage);
    } catch {
      toast.error(copyFailedMessage);
    }
  });

  container.append(value, copyButton);

  return {
    container,
    clear: () => {
      value.textContent = '';
      container.replaceChildren();
    },
  };
}

/**
 * Reveals a generated secret once without inserting it into an HTML string.
 * The modal cannot be dismissed accidentally; callers should also clear their
 * own plaintext state after this promise resolves.
 */
export async function showOneTimeSecret({
  title,
  description,
  secret,
  copyLabel = 'Copiar',
  copiedMessage = 'Copiado al portapapeles',
  copyFailedMessage = 'No se pudo copiar. Selecciona el valor manualmente.',
  confirmText = 'Ya lo guardé',
}: OneTimeSecretOptions): Promise<void> {
  const Swal = await loadSweetAlert();
  const descriptionElement = document.createElement('p');
  descriptionElement.className = 'furyleeds-secret-reveal__description';
  descriptionElement.textContent = description;

  const secretContent = createSecretContent(
    secret,
    copyLabel,
    copiedMessage,
    copyFailedMessage
  );
  const content = document.createElement('div');
  content.append(descriptionElement, secretContent.container);

  try {
    await Swal.fire({
      title,
      html: content,
      icon: 'info',
      confirmButtonText: confirmText,
      allowOutsideClick: false,
      allowEscapeKey: false,
      showCloseButton: false,
      customClass: ACTION_ALERT_CLASSES,
      buttonsStyling: false,
      heightAuto: false,
    });
  } finally {
    descriptionElement.textContent = '';
    secretContent.clear();
    content.replaceChildren();
  }
}
