import { BadRequestException } from '@nestjs/common';

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export function validatePushSubscription(
  value: unknown,
): PushSubscriptionInput {
  if (typeof value !== 'object' || value === null)
    throw new BadRequestException('Invalid push subscription');
  const { endpoint, keys } = value as Partial<PushSubscriptionInput>;
  if (typeof endpoint !== 'string' || endpoint.length > 2048 || !keys)
    throw new BadRequestException('Invalid push subscription');
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new BadRequestException('Invalid push endpoint');
  }
  const supported =
    ['fcm.googleapis.com', 'updates.push.services.mozilla.com'].includes(
      url.hostname,
    ) ||
    url.hostname.endsWith('.push.apple.com') ||
    url.hostname.endsWith('.notify.windows.com');
  if (
    !supported ||
    url.protocol !== 'https:' ||
    (url.port && url.port !== '443') ||
    url.username ||
    url.password ||
    url.hash ||
    url.pathname === '/'
  )
    throw new BadRequestException('Unsupported push endpoint');
  const decode = (key: unknown, length: number) => {
    if (
      typeof key !== 'string' ||
      key.length > 90 ||
      !/^[A-Za-z0-9_-]+={0,2}$/.test(key)
    )
      throw new BadRequestException('Invalid push key');
    const bytes = Buffer.from(key, 'base64url');
    if (
      bytes.length !== length ||
      bytes.toString('base64url') !== key.replace(/=+$/, '')
    )
      throw new BadRequestException('Invalid push key');
    return bytes;
  };
  const publicKey = decode(keys.p256dh, 65);
  if (publicKey[0] !== 4)
    throw new BadRequestException('Invalid push public key');
  decode(keys.auth, 16);
  return {
    endpoint: url.toString(),
    keys: {
      p256dh: keys.p256dh.replace(/=+$/, ''),
      auth: keys.auth.replace(/=+$/, ''),
    },
  };
}
