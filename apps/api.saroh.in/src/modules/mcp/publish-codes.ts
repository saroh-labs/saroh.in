import { createHash, randomBytes } from "node:crypto";

import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import { draftFingerprint as snapshotDigest } from "../sites/review-route";
import type {
    ConfirmDraft,
    DraftSite,
    SitesService,
} from "../sites/sites.service";
import type { McpCall } from "./activity.service";
import { ToolError } from "./tool-registry";

/** How long a publish summary's code can be confirmed. */
export const PUBLISH_CODE_TTL_MS = 10 * 60 * 1000;

const digestOf = (code: string) =>
    createHash("sha256").update(code).digest("hex");

const NEW_SUMMARY =
    "Call preview_publish to get the new summary and code, show it to the person, and publish only once they say yes.";

/**
 * What a summary binds: the route (live or to reviewers) and a digest of
 * the draft exactly as publish freezes it (`SitesService.loadDraftSite`),
 * so any change that would go live changes it.
 */
export const publishFingerprint = (toReviewers: boolean, draft: DraftSite) =>
    `${toReviewers ? "review" : "live"}:${snapshotDigest(draft)}`;

const draftChanged = () =>
    new ToolError(
        "The draft changed since you showed the person what goes live.",
        NEW_SUMMARY,
    );

/**
 * The publish's last check (`ConfirmDraft`), run in its transaction under
 * the site's lock: the draft it is about to freeze is still the one in the
 * database (a save after publish read it is refused), and the code takes.
 * Any refusal rolls back with the publish, and a publish that fails puts
 * the code back.
 */
export function confirmPublish(
    call: McpCall,
    siteId: string,
    code: string,
    toReviewers: boolean,
    now: Date,
    sites: Pick<SitesService, "loadDraftSite">,
): ConfirmDraft {
    return async (tx, draft) => {
        const current = await sites.loadDraftSite(
            { id: siteId, organizationId: call.ctx.organizationId },
            tx,
        );
        if (!current || snapshotDigest(current) !== snapshotDigest(draft)) {
            throw draftChanged();
        }
        await redeemPublishCode(
            call,
            siteId,
            code,
            publishFingerprint(toReviewers, draft),
            now,
            tx,
        );
    };
}

/**
 * A new single-use code for this connection, business, site and draft.
 * Only its digest is stored. Clears this business's expired codes on the
 * way, so the table never grows past what is pending.
 */
export async function issuePublishCode(
    { ctx, connection }: McpCall,
    siteId: string,
    fingerprint: string,
    now: Date,
): Promise<{ code: string; expiresAt: Date }> {
    const code = randomBytes(18).toString("base64url");
    const expiresAt = new Date(now.getTime() + PUBLISH_CODE_TTL_MS);
    await prisma.mcpPublishCode.deleteMany({
        where: { organizationId: ctx.organizationId, expiresAt: { lt: now } },
    });
    await prisma.mcpPublishCode.create({
        data: {
            organizationId: ctx.organizationId,
            siteId,
            connectionId: connection.id,
            codeDigest: digestOf(code),
            draftFingerprint: fingerprint,
            expiresAt,
        },
        select: { id: true },
    });
    return { code, expiresAt };
}

/**
 * Takes the code, once: refused when it is unknown, used, expired, from
 * another connection, business or site, or when the draft changed since
 * its summary. Taken atomically, so two calls racing get one yes.
 */
export async function redeemPublishCode(
    { ctx, connection }: McpCall,
    siteId: string,
    code: string,
    fingerprint: string,
    now: Date,
    db: Pick<Prisma.TransactionClient, "mcpPublishCode"> = prisma,
): Promise<void> {
    // Read in this business only (RLS and the filter): another business's
    // code is "unknown" here.
    const row = await db.mcpPublishCode.findFirst({
        where: {
            codeDigest: digestOf(code),
            organizationId: ctx.organizationId,
        },
        select: {
            id: true,
            siteId: true,
            connectionId: true,
            draftFingerprint: true,
            expiresAt: true,
            usedAt: true,
        },
    });
    if (row?.connectionId !== connection.id || row.siteId !== siteId) {
        throw new ToolError(
            "This confirm_code isn't one Saroh gave this connection for this website.",
            NEW_SUMMARY,
        );
    }
    const taken = await db.mcpPublishCode.updateMany({
        where: { id: row.id, usedAt: null },
        data: { usedAt: now },
    });
    if (taken.count !== 1 || row.usedAt) {
        throw new ToolError("This confirm_code was already used.", NEW_SUMMARY);
    }
    if (row.expiresAt <= now) {
        throw new ToolError(
            "This confirm_code has expired: codes last 10 minutes.",
            NEW_SUMMARY,
        );
    }
    if (row.draftFingerprint !== fingerprint) throw draftChanged();
}
