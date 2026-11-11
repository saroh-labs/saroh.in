import { z } from "zod";

/**
 * Shapes every public route and MCP tool shares (plan 2026-11-10-001, U1).
 * Per-route schemas live beside them in later units.
 */

export const ERROR_CODES = [
    "invalid_request",
    "unauthorized",
    // The key's creator no longer holds the business (left, removed or paused).
    "key_owner_inactive",
    "forbidden",
    "not_found",
    "conflict",
    // The business takes no online payment: no provider connected, or Payments off.
    "payments_unavailable",
    "rate_limited",
    "internal",
] as const;

export const errorCode = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof errorCode>;

/** What every public error response carries; `requestId` matches `X-Request-Id`. */
export const errorEnvelope = z
    .object({
        error: z.object({
            code: errorCode,
            message: z.string(),
            requestId: z.string(),
        }),
    })
    .describe("Error");
export type ErrorEnvelope = z.infer<typeof errorEnvelope>;

/** Ids are opaque strings; callers never parse them. */
export const id = z.string().min(1).max(64);

/** Money in the currency's minor unit (paise, cents), never a float. */
export const money = z.strictObject({
    amountMinor: z.number().int(),
    currency: z
        .string()
        .regex(/^[A-Z]{3}$/, "Must be an ISO 4217 code, like INR"),
});
export type Money = z.infer<typeof money>;

// base64url without padding: a length of 1 mod 4 can't come from any bytes.
const BASE64URL = /^[A-Za-z0-9_-]+$/;

/** An opaque page cursor: base64url, which the caller passes back unchanged. */
export const cursor = z
    .string()
    .max(512)
    .regex(BASE64URL, "Not a valid cursor")
    .refine((value) => value.length % 4 !== 1, "Not a valid cursor");

// shortcut: Buffer is Node-only, so these run in the API, not a browser; switch to btoa/TextEncoder if a client needs them.
export function encodeCursor(value: string): string {
    return Buffer.from(value, "utf8").toString("base64url");
}

export function decodeCursor(value: string): string {
    return Buffer.from(value, "base64url").toString("utf8");
}

/** The query every list route takes. Query values are text, so `limit` converts on purpose. */
export const pageQuery = z.strictObject({
    cursor: cursor.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type PageQuery = z.infer<typeof pageQuery>;

/** A list response: one page of `item`, and the cursor for the next, or null at the end. */
export function page<T extends z.ZodType>(item: T) {
    return z.object({ data: z.array(item), nextCursor: cursor.nullable() });
}
