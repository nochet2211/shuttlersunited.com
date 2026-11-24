import PocketBase from 'pocketbase';
import {
  POCKETBASE_URL,
  POCKETBASE_ADMIN_EMAIL,
  POCKETBASE_ADMIN_PASSWORD,
} from 'astro:env/server';

/**
 * A request-scoped client. Never share one across requests — PocketBase keeps
 * auth state on the instance, so a shared client would leak one member's token
 * into another member's request.
 */
export function createClient(): PocketBase {
  const pb = new PocketBase(POCKETBASE_URL);
  pb.autoCancellation(false);
  return pb;
}

let adminClient: PocketBase | null = null;

/**
 * A superuser client for privileged server-side work: writing payment ledger
 * rows from the Razorpay webhook, issuing OTPs, and reading collections that
 * are locked down to admins by API rule.
 *
 * This must never be handed to the browser or used to serve data that hasn't
 * been authorization-checked first.
 */
export async function getAdminClient(): Promise<PocketBase> {
  if (!adminClient) {
    adminClient = new PocketBase(POCKETBASE_URL);
    adminClient.autoCancellation(false);
  }

  if (!adminClient.authStore.isValid) {
    await adminClient
      .collection('_superusers')
      .authWithPassword(POCKETBASE_ADMIN_EMAIL, POCKETBASE_ADMIN_PASSWORD);
  }

  return adminClient;
}

/** PocketBase throws a ClientResponseError with a `status` field. */
export function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    (error as { status: number }).status === 404
  );
}
