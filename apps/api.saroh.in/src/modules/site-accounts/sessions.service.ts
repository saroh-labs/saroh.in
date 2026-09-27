import { createHash, randomBytes } from "node:crypto";

import { Injectable } from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma, runInOrgContext } from "@saroh/database";

import type { CustomerContext } from "./customer-context.decorator";
import type { SiteHost } from "./site-host";

/**
 * A customer's session on a business's own site (ADR-011; round-2 plan A,
 * A3, default 6).
 *
 * The token is 256 random bits, handed out once and stored only as its
 * SHA-256 (the pay link's pattern). The site's server keeps it in a
 * host-only `__Host-` cookie and sends it back in `x-customer-session`.
 *
 * A session belongs to one business and one site. It is accepted only on
 * the host that resolves to that same site, so a token copied to another
 * business's site, or to another site of the same business, signs nobody
 * in there. Sessions last 30 days and slide: a visit more than an hour after
 * the last one pushes the end out again, never past 90 days from sign-in.
 */

/** A new session lasts 30 days (default 6). */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60_000;
/** Sliding renewal never takes a session past 90 days from its start. */
export const SESSION_MAX_AGE_MS = 90 * 24 * 60 * 60_000;
/** `lastSeenAt` (and the slide) is written at most once an hour. */
export const SESSION_TOUCH_MS = 60 * 60_000;

export function hashSessionToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
}

/** What `sessions` answers once: the token is never shown again. */
export interface SessionIssued {
    token: string;
    expiresAt: string;
}

/** The signed-in customer as the site may show them: an allow-list. */
export interface SignedInCustomer {
    email: string;
    /** The contact's name, or null until the customer gives one. */
    name: string | null;
}

type Db = Pick<Prisma.TransactionClient, "customerSession">;

@Injectable()
export class SessionsService {
    /**
     * Open a session for an account on a site. Runs on the caller's
     * transaction, so a sign-in that fails after linking leaves no session.
     */
    async create(
        db: Db,
        input: {
            organizationId: string;
            siteId: string;
            accountId: string;
            now: Date;
        },
    ): Promise<SessionIssued> {
        const token = randomBytes(32).toString("base64url");
        const expiresAt = new Date(input.now.getTime() + SESSION_TTL_MS);
        await db.customerSession.create({
            data: {
                organizationId: input.organizationId,
                accountId: input.accountId,
                siteId: input.siteId,
                tokenHash: hashSessionToken(token),
                expiresAt,
                lastSeenAt: input.now,
                createdAt: input.now,
            },
        });
        return { token, expiresAt: expiresAt.toISOString() };
    }

    /**
     * The customer a token signs in on this site, or null. Null for a token
     * that is unknown, revoked, expired, from another business or another
     * site, or whose account is no longer ACTIVE. Slides the session when the
     * last touch is more than an hour old.
     */
    resolve(
        token: string,
        site: SiteHost,
        now: Date = new Date(),
    ): Promise<CustomerContext | null> {
        if (!token || token.length > 256) return Promise.resolve(null);
        return runInOrgContext(site.organizationId, async () => {
            const session = await prisma.customerSession.findFirst({
                where: {
                    tokenHash: hashSessionToken(token),
                    organizationId: site.organizationId,
                },
                select: {
                    id: true,
                    siteId: true,
                    accountId: true,
                    expiresAt: true,
                    revokedAt: true,
                    lastSeenAt: true,
                    createdAt: true,
                    account: { select: { status: true, contactId: true } },
                },
            });
            if (!session) return null;
            if (
                session.siteId !== site.siteId ||
                session.revokedAt !== null ||
                session.expiresAt <= now ||
                session.account.status !== "ACTIVE"
            ) {
                return null;
            }
            if (
                now.getTime() - session.lastSeenAt.getTime() >=
                SESSION_TOUCH_MS
            ) {
                await prisma.customerSession.updateMany({
                    where: {
                        id: session.id,
                        organizationId: site.organizationId,
                        revokedAt: null,
                    },
                    data: {
                        lastSeenAt: now,
                        expiresAt: slidExpiry(session.createdAt, now),
                    },
                });
            }
            return {
                organizationId: site.organizationId,
                siteId: site.siteId,
                accountId: session.accountId,
                contactId: session.account.contactId,
                sessionId: session.id,
            };
        });
    }

    /** The signed-in customer, allow-listed for the site. */
    async describe(context: CustomerContext): Promise<SignedInCustomer> {
        const account = await prisma.customerAccount.findFirstOrThrow({
            where: {
                id: context.accountId,
                organizationId: context.organizationId,
            },
            select: {
                email: true,
                contact: { select: { firstName: true, lastName: true } },
            },
        });
        const name = [account.contact.firstName, account.contact.lastName]
            .map((part) => part?.trim() ?? "")
            .filter(Boolean)
            .join(" ");
        return { email: account.email, name: name || null };
    }

    /** Sign out: this session only. */
    async revoke(context: CustomerContext, now: Date = new Date()) {
        await prisma.customerSession.updateMany({
            where: {
                id: context.sessionId,
                organizationId: context.organizationId,
                revokedAt: null,
            },
            data: { revokedAt: now },
        });
    }

    /** Sign out everywhere: every live session of the account. */
    async revokeAll(context: CustomerContext, now: Date = new Date()) {
        const revoked = await prisma.customerSession.updateMany({
            where: {
                accountId: context.accountId,
                organizationId: context.organizationId,
                revokedAt: null,
            },
            data: { revokedAt: now },
        });
        return { revoked: revoked.count };
    }
}

/** The end a touch at `now` slides a session to: 30 days on, at most 90 from its start. */
export function slidExpiry(createdAt: Date, now: Date): Date {
    return new Date(
        Math.min(
            now.getTime() + SESSION_TTL_MS,
            createdAt.getTime() + SESSION_MAX_AGE_MS,
        ),
    );
}
