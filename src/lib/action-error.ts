import { isInputError } from 'astro:actions';
import type { ActionError } from 'astro:actions';

/**
 * Turns an action error into something a person can act on.
 *
 * Astro's default message for a schema failure is the raw zod dump — "Failed to
 * validate: [{ code: ... }]" — which tells an editor nothing. `isInputError`
 * carries the per-field messages the schema actually defines, so use those when
 * they exist and fall back to the thrown message otherwise.
 */
export function actionMessage(error: ActionError | undefined): string | null {
  if (!error) return null;

  if (isInputError(error)) {
    const messages = Object.values(error.fields).flatMap((list) => list ?? []);
    if (messages.length > 0) return messages.join(' ');
  }

  return error.message;
}
