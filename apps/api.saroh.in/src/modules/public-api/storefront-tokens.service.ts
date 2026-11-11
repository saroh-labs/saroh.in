import { randomBytes } from "node:crypto";

import { Injectable, NotFoundException } from "@nestjs/common";
import type {
    MintStorefrontTokenBody,
    StorefrontTokenView,
} from "@saroh/api-contract";
import { STOREFRONT_TOKEN_PATTERN } from "@saroh/api-contract";
import type { ApiKey, StorefrontToken } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { base62, isUsable, tokenDigest } from "../api-keys/api-keys.service";
import { authorize } from "../organizations/organization-policy";

/** How long one visitor's token lasts (plan 2026-11-10-001, U7). */
export const STOREFRONT_TOKEN_TTL_MS = 30 * 60_000;

/** A new storefront token. Shown once; only its digest is kept. */
export function mintStorefrontToken(): string {
    return `st_live_${base62(randomBytes(32))}`;
}

/**
 * Storefront tokens (U7): a business's server, with a secret key holding
 * `storefront:mint`, mints one per visitor; the visitor's browser then
 * books, orders and sends enquiries with it under `/v1/storefront/write/…`.
 * About 30 minutes, the allowed origins copied from a publishable key the
 * business chose, the visitor's email the server vouches for (the only one
 * its orders and bookings may use), and only a digest stored. Swept after `expiresAt`.
 */
@Injectable()
export class StorefrontTokensService {
    async mint(
        ctx: OrganizationContext,
        secretKeyId: string,
        body: MintStorefrontTokenBody,
        now: Date = new Date(),
    ): Promise<StorefrontTokenView> {
        authorize(ctx, "storefront:mint");
        const publishable = await prisma.apiKey.findFirst({
            where: {
                id: body.publishableKeyId,
                organizationId: ctx.organizationId,
                kind: "PUBLISHABLE",
            },
        });
        if (!publishable || !isUsable(publishable, now)) {
            throw new NotFoundException({
                error: {
                    code: "not_found",
                    message: "No usable publishable key with that id.",
                },
            });
        }
        const token = mintStorefrontToken();
        const expiresAt = new Date(now.getTime() + STOREFRONT_TOKEN_TTL_MS);
        await prisma.storefrontToken.create({
            data: {
                organizationId: ctx.organizationId,
                apiKeyId: secretKeyId,
                tokenDigest: tokenDigest(token),
                allowedOrigins: publishable.allowedOrigins,
                visitorEmail: body.visitor?.email.trim().toLowerCase() ?? null,
                expiresAt,
            },
        });
        return {
            token,
            expiresAt: expiresAt.toISOString(),
            allowedOrigins: publishable.allowedOrigins,
        };
    }

    /**
     * The token a Bearer value opens, with the secret key that minted it,
     * or null: unknown, expired, or its key revoked, expired or past grace.
     */
    async find(
        token: string,
        now: Date = new Date(),
    ): Promise<(StorefrontToken & { apiKey: ApiKey }) | null> {
        if (!STOREFRONT_TOKEN_PATTERN.test(token)) return null;
        const row = await prisma.storefrontToken.findUnique({
            where: { tokenDigest: tokenDigest(token) },
            include: { apiKey: true },
        });
        if (!row || row.expiresAt.getTime() <= now.getTime()) return null;
        return isUsable(row.apiKey, now) ? row : null;
    }
}
