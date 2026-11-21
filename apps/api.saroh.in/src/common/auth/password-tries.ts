import { env } from "../../env";
import type { WindowLimiter } from "../../modules/rate-limits/shared-window";
import { SharedRateLimiter } from "../../modules/rate-limits/shared-window";
import { emailHash } from "./code-mail-limits";

const DEFAULT_FAILS = 10;
const DEFAULT_WINDOW_MINUTES = 15;

type TriesLimiter = WindowLimiter & {
    blocked(key: string, now?: number): boolean | Promise<boolean>;
};

const fails = () => Number(env.PASSWORD_FAILS_PER_ACCOUNT) || DEFAULT_FAILS;
const windowMs = () =>
    (Number(env.PASSWORD_FAIL_WINDOW_MINUTES) || DEFAULT_WINDOW_MINUTES) *
    60_000;

/**
 * Wrong passwords per account (A-03), on top of Better Auth's per-caller
 * limit: past `PASSWORD_FAILS_PER_ACCOUNT` in `PASSWORD_FAIL_WINDOW_MINUTES`
 * a password sign-in for that address is refused until the window turns,
 * from any address. Keyed by the address's hash, known or not, so the
 * answer never says whether an account exists. In Redis (`SharedRateLimiter`).
 *
 * Fails are counted only after the password check returns, so a parallel
 * burst could pass `blocked` before any lands (02-limits L7). Each try
 * therefore also takes one attempt up front, atomically, from a window of
 * twice the fails: the burst stops there, whatever the answers.
 */
export function passwordTries(
    limiter: TriesLimiter = new SharedRateLimiter(
        "password-fails",
        fails(),
        windowMs(),
    ),
    attempts: WindowLimiter = new SharedRateLimiter(
        "password-attempts",
        fails() * 2,
        windowMs(),
    ),
) {
    return {
        blocked: async (email: string) => {
            const key = emailHash(email);
            if (await limiter.blocked(key))
                return {
                    retryAfterSeconds: await limiter.retryAfterSeconds(key),
                };
            return (await attempts.take(key))
                ? null
                : { retryAfterSeconds: await attempts.retryAfterSeconds(key) };
        },
        failed: async (email: string) => {
            await limiter.take(emailHash(email));
        },
    };
}
