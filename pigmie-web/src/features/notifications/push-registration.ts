interface BrowserSubscription {
  endpoint: string;
  toJSON(): PushSubscriptionJSON;
  unsubscribe(): Promise<boolean>;
}

interface RegistrationDependencies {
  currentAccount(): Promise<boolean>;
  existing(): Promise<BrowserSubscription | null>;
  create(): Promise<BrowserSubscription>;
  save(subscription: PushSubscriptionJSON): Promise<unknown>;
}

let registrationTail: Promise<unknown> = Promise.resolve();

/** Serialize native browser changes across mounted components and account switches. */
export function registerBrowserPush(dependencies: RegistrationDependencies): Promise<void> {
  const operation = registrationTail.catch(() => undefined).then(async () => {
    const requireAccount = async () => {
      if (!await dependencies.currentAccount()) throw new Error('Notification account changed');
    };
    await requireAccount();
    const existing = await dependencies.existing();
    await requireAccount();
    const subscription = existing ?? await dependencies.create();
    await requireAccount();
    try {
      await dependencies.save(subscription.toJSON());
    } catch (error) {
      const status = typeof error === 'object' && error !== null && 'response' in error
        ? (error.response as { status?: number } | undefined)?.status : undefined;
      // A foreign tenant's subscription is deliberately invisible to the API.
      // Recover by invalidating it at the browser, never by bypassing tenant policies.
      if (!existing || status !== 409) throw error;
      await requireAccount();
      if (!await existing.unsubscribe()) throw new Error('Unable to reset browser notifications');
      await requireAccount();
      const replacement = await dependencies.create();
      await requireAccount();
      if (replacement.endpoint === existing.endpoint) throw new Error('Browser notification reset requires retry');
      await dependencies.save(replacement.toJSON());
    }
  });
  registrationTail = operation;
  return operation;
}
