/**
 * What `/api/downloads/unlock` answers the downloads' gate (plan
 * 2026-10-31-002 U9). Every refusal is its own reason, so the page can say
 * the right thing: `bad-contact` (the email or number sent isn't one),
 * `rate-limited`, `challenge` (Turnstile didn't pass; show it again), and
 * `unavailable` (anything else, the file isn't given).
 *
 * `emailed`: `sent`, `limited`, `not-sent` as the tools' gate; `none` for a
 * WhatsApp number, which is never messaged.
 */
export type DownloadUnlockResult =
    | { unlocked: true; emailed: "sent" | "limited" | "not-sent" | "none" }
    | {
          unlocked: false;
          failure: "bad-contact" | "rate-limited" | "challenge" | "unavailable";
      };

/** `GET /api/downloads/unlock`: the Turnstile key to draw the check with, or null when none is asked. */
export interface DownloadGateOptions {
    turnstileSiteKey: string | null;
}
