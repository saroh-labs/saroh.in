import { z } from "zod";

import { id } from "./common";

/**
 * Settings › API and AI apps › Keys (plan 2026-11-10-001, U5): the owner's
 * workspace routes under `organizations/:organizationId/api-keys`. Not a
 * public route, so not in the OpenAPI documents.
 */

export const API_KEY_KINDS = ["PUBLISHABLE", "SECRET"] as const;
export const apiKeyKind = z.enum(API_KEY_KINDS);
export type ApiKeyKind = z.infer<typeof apiKeyKind>;

/**
 * Where a publishable key may be used from: an https origin, or localhost
 * (any port) for a business building its site. Stored as the URL's origin,
 * so `https://Shop.in/` and `https://shop.in` are one entry.
 */
export const allowedOrigin = z
    .string()
    .trim()
    .max(200)
    .transform((value, ctx) => {
        let url: URL;
        try {
            url = new URL(value);
        } catch {
            ctx.addIssue({ code: "custom", message: "Not a web address" });
            return z.NEVER;
        }
        const local =
            url.protocol === "http:" &&
            ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
        const bare =
            (url.pathname === "/" || url.pathname === "") &&
            !url.search &&
            !url.hash &&
            !url.username &&
            !url.password;
        if (!bare || (url.protocol !== "https:" && !local)) {
            ctx.addIssue({
                code: "custom",
                message:
                    "Must be an https address with no path, like https://shop.in, or localhost",
            });
            return z.NEVER;
        }
        return url.origin;
    });

export const createApiKeyBody = z.strictObject({
    kind: apiKeyKind,
    name: z.string().trim().min(1).max(80),
    /** What a secret key may do; clamped to the creator's own powers. A publishable key's is fixed. */
    scope: z.array(z.string().max(64)).max(200).optional(),
    /** Publishable keys only. */
    allowedOrigins: z.array(allowedOrigin).max(20).optional(),
    /** The AI switch: a secret key that may also reach the MCP. Off by default. */
    aiEnabled: z.boolean().optional(),
    expiresAt: z.iso.datetime({ offset: true }).optional(),
});
export type CreateApiKeyBody = z.infer<typeof createApiKeyBody>;

export const apiKeyView = z.object({
    id,
    kind: apiKeyKind,
    name: z.string(),
    /** The token's visible start (`sk_live_Ab3d`), to tell keys apart. Never the token. */
    prefix: z.string(),
    scope: z.array(z.string()),
    allowedOrigins: z.array(z.string()),
    aiEnabled: z.boolean(),
    createdByUserId: id,
    rolledFromId: id.nullable(),
    expiresAt: z.string().nullable(),
    revokedAt: z.string().nullable(),
    graceUntil: z.string().nullable(),
    lastUsedAt: z.string().nullable(),
    createdAt: z.string(),
});
export type ApiKeyView = z.infer<typeof apiKeyView>;

/** A key just made or rolled: the only answer that ever carries the token. */
export const createdApiKey = z.object({ key: apiKeyView, token: z.string() });
export type CreatedApiKey = z.infer<typeof createdApiKey>;

export const apiKeyList = z.object({ data: z.array(apiKeyView) });
export type ApiKeyList = z.infer<typeof apiKeyList>;
