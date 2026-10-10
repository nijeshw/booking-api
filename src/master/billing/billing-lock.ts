export const BILLING_LOCK_MESSAGE =
  'This business is paused until the invoice is paid';

export const PUBLIC_LOCK_MESSAGE =
  'This business is not taking bookings right now';

const LOCKED_STATUSES = new Set(['PAST_DUE', 'UNPAID']);

export function subscriptionLocksApp(
  status: string | null | undefined,
): boolean {
  return status != null && LOCKED_STATUSES.has(status);
}
