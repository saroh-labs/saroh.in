import { HttpException, HttpStatus } from "@nestjs/common";
import type { ErrorCode } from "@saroh/api-contract";
import type { Response } from "express";

import { hashClientIp, requestAddress } from "../../common/client-ip";
import { env } from "../../env";
import type { WindowLimiter } from "../rate-limits/shared-window";
import { SharedRateLimiter } from "../rate-limits/shared-window";

/** Keys and tokens that open nothing, per caller address, in a minute. */
export const WRONG_KEYS_PER_MINUTE = 30;

const wrongKeys = new SharedRateLimiter(
    "api-wrong-keys",
    WRONG_KEYS_PER_MINUTE,
    60_000,
);

/**
 * Counts a key or visitor token that opened nothing (v1, storefront, MCP)
 * against the caller's address, the one `@ClientAddress()` gives. Past the
 * window the answer is 429 in the public contract's shape with
 * `Retry-After`, in place of the 401. Only refusals are counted: a key that
 * works never is, so callers that share an address keep their own per-key
 * limits.
 */
export async function countWrongKey(
    req: Parameters<typeof requestAddress>[0],
    res: Pick<Response, "setHeader">,
    limiter: WindowLimiter = wrongKeys,
): Promise<void> {
    const address = hashClientIp(requestAddress(req, env.TRUST_PROXY));
    if (!address || (await limiter.take(address))) return;
    const wait = await limiter.retryAfterSeconds(address);
    res.setHeader("Retry-After", String(wait));
    throw new HttpException(
        {
            error: {
                code: "rate_limited" satisfies ErrorCode,
                message: `Too many requests with a key that isn't valid. Try again in ${wait} seconds.`,
            },
        },
        HttpStatus.TOO_MANY_REQUESTS,
    );
}
