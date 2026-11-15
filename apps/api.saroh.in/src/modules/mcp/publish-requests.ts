import { createHash, randomBytes } from "node:crypto";

import { ConflictException, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import { appBaseOf } from "../../common/app-url";
import { draftFingerprint as snapshotDigest } from "../sites/review-route";
import type {
    ConfirmDraft,
    DraftSite,
    SitesService,
} from "../sites/sites.service";
import type { McpCall } from "./activity.service";

/**
 * Publish requests (DEC-215, as amended 12 Nov 2026): an AI app can't
 * publish. `preview_publish` makes a request bound to the connection,
 * business, site and exact draft, and answers with a link into Saroh; only
 * a signed-in person with `site:publish` there confirms or declines it
 * (`PublishRequestsService`). The link carries the request's token, which
 * acts on nothing by itself; only its digest is stored.
 */

/** How long a request can be confirmed: a person may open the link later. */
export const PUBLISH_REQUEST_TTL_MS = 24 * 60 * 60 * 1000;
/** How long a settled or ended request is kept, so its link still says what happened. */
const KEPT_MS = 7 * 24 * 60 * 60 * 1000;

export const tokenDigest = (token: string) =>
    createHash("sha256").update(token).digest("hex");

/**
 * What a request binds: the route (live or to reviewers) and a digest of
 * the draft exactly as publish freezes it (`SitesService.loadDraftSite`),
 * so any change that would go live changes it.
 */
export const publishFingerprint = (toReviewers: boolean, draft: DraftSite) =>
    `${toReviewers ? "review" : "live"}:${snapshotDigest(draft)}`;

export const toReviewersOf = (fingerprint: string) =>
    fingerprint.startsWith("review:");

export type PublishOutcome = "PUBLISHED" | "SENT_FOR_APPROVAL" | "DECLINED";
export type PublishRequestStatus =
    "open" | "expired" | "published" | "sent_for_approval" | "declined";

const requestSelect = {
    id: true,
    siteId: true,
    connectionId: true,
    clientName: true,
    requestedByUserId: true,
    draftFingerprint: true,
    expiresAt: true,
    usedAt: true,
    outcome: true,
    decidedByUserId: true,
    createdAt: true,
} as const satisfies Prisma.McpPublishCodeSelect;

export type PublishRequestRow = Prisma.McpPublishCodeGetPayload<{
    select: typeof requestSelect;
}>;

/** Where the person confirms: the business's own app, opened on that business. */
export async function publishRequestUrl(
    organizationId: string,
    siteId: string,
    token: string,
): Promise<string> {
    const to = `/sites/${encodeURIComponent(siteId)}/publish-requests/${encodeURIComponent(token)}`;
    return `${await appBaseOf(organizationId)}/open/${encodeURIComponent(organizationId)}?${new URLSearchParams({ to }).toString()}`;
}

/**
 * A new request for this connection, business, site and draft. A newer
 * request for the same site ends any still open (so only the latest
 * summary can be confirmed), and requests older than a week are cleared.
 */
export async function openPublishRequest(
    { ctx, connection }: McpCall,
    siteId: string,
    fingerprint: string,
    now: Date,
): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(18).toString("base64url");
    const expiresAt = new Date(now.getTime() + PUBLISH_REQUEST_TTL_MS);
    await prisma.$transaction([
        prisma.mcpPublishCode.deleteMany({
            where: {
                organizationId: ctx.organizationId,
                createdAt: { lt: new Date(now.getTime() - KEPT_MS) },
            },
        }),
        prisma.mcpPublishCode.updateMany({
            where: {
                organizationId: ctx.organizationId,
                siteId,
                usedAt: null,
                expiresAt: { gt: now },
            },
            data: { expiresAt: now },
        }),
        prisma.mcpPublishCode.create({
            data: {
                organizationId: ctx.organizationId,
                siteId,
                connectionId: connection.id,
                clientName: connection.clientName ?? "AI app",
                requestedByUserId: ctx.userId,
                codeDigest: tokenDigest(token),
                draftFingerprint: fingerprint,
                expiresAt,
            },
            select: { id: true },
        }),
    ]);
    return { token, expiresAt };
}

/** The request this token names, in this business only (RLS and the filter). */
export function findPublishRequest(
    organizationId: string,
    token: string,
    db: Pick<Prisma.TransactionClient, "mcpPublishCode"> = prisma,
): Promise<PublishRequestRow | null> {
    return db.mcpPublishCode.findFirst({
        where: { codeDigest: tokenDigest(token), organizationId },
        select: requestSelect,
    });
}

export function statusOf(
    row: Pick<PublishRequestRow, "usedAt" | "outcome" | "expiresAt">,
    now: Date,
): PublishRequestStatus {
    if (row.usedAt) {
        return row.outcome === "PUBLISHED"
            ? "published"
            : row.outcome === "SENT_FOR_APPROVAL"
              ? "sent_for_approval"
              : "declined";
    }
    return row.expiresAt <= now ? "expired" : "open";
}

const AGAIN = "Ask the AI app to prepare it again.";

export const requestNotFound = () =>
    new NotFoundException("This publish request isn't here.");

export const requestExpired = () =>
    new ConflictException({
        message: `This publish request has expired. ${AGAIN}`,
        details: { code: "PUBLISH_REQUEST_EXPIRED" },
    });

export const requestUsed = () =>
    new ConflictException({
        message: "This publish request was already answered.",
        details: { code: "PUBLISH_REQUEST_USED" },
    });

export const draftChanged = () =>
    new ConflictException({
        message: `The website changed since the AI app prepared this. ${AGAIN}`,
        details: { code: "DRAFT_CHANGED" },
    });

/** Refuses a request that is no longer open, in its own words. */
export function assertOpen(row: PublishRequestRow, now: Date): void {
    const status = statusOf(row, now);
    if (status === "expired") throw requestExpired();
    if (status !== "open") throw requestUsed();
}

/**
 * Takes the request, once: two clicks racing get one yes. Refused when it
 * was answered or ended since it was read.
 */
export async function takeRequest(
    db: Pick<Prisma.TransactionClient, "mcpPublishCode">,
    row: PublishRequestRow,
    decidedByUserId: string,
    outcome: PublishOutcome,
    now: Date,
): Promise<void> {
    const taken = await db.mcpPublishCode.updateMany({
        where: { id: row.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now, outcome, decidedByUserId },
    });
    if (taken.count === 1) return;
    const fresh = await db.mcpPublishCode.findUnique({
        where: { id: row.id },
        select: requestSelect,
    });
    if (!fresh) throw requestNotFound();
    assertOpen(fresh, now);
    throw requestUsed();
}

/**
 * The publish's last check (`ConfirmDraft`), run in its transaction under
 * the site's lock: the draft it is about to freeze is still the one in the
 * database and the one the request described, and the request takes. Any
 * refusal rolls back with the publish, and a publish that fails leaves the
 * request open.
 */
export function confirmPublishRequest(
    organizationId: string,
    row: PublishRequestRow,
    decidedByUserId: string,
    toReviewers: boolean,
    now: Date,
    sites: Pick<SitesService, "loadDraftSite">,
): ConfirmDraft {
    return async (tx, draft) => {
        const current = await sites.loadDraftSite(
            { id: row.siteId, organizationId },
            tx,
        );
        if (
            !current ||
            snapshotDigest(current) !== snapshotDigest(draft) ||
            publishFingerprint(toReviewers, draft) !== row.draftFingerprint
        ) {
            throw draftChanged();
        }
        await takeRequest(
            tx,
            row,
            decidedByUserId,
            toReviewers ? "SENT_FOR_APPROVAL" : "PUBLISHED",
            now,
        );
    };
}
