import { toast } from 'sonner';

/** Activation can reload the page: never do it while a payment form is being edited. */
export function offerAppUpdate(activate: () => Promise<void>) {
  toast('An app update is ready', {
    id: 'pigmie-app-update',
    duration: Infinity,
    description: 'Finish or save your current form before reloading. Saved collections remain on this device.',
    action: { label: 'Reload now', onClick: () => {
      void activate().catch(() => toast.error('Could not update the app. Your saved collections remain on this device.'));
    } },
  });
}
