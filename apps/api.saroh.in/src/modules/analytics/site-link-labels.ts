import { prisma } from "@saroh/database";

import { visitRefOf } from "./visit-source";

/**
 * The live link labels of one site (DEC-181), as the public intake checks
 * a visit step's `ref` against them: a label is kept only when it is one
 * of the links the business made in Saroh for that site, never another
 * business's, never an archived one.
 *
 * Saroh Social's posts count the same way (plan saroh-social
 * 2026-11-18-001, R5): a post's `ref` (`social-<letters>`) is a live label
 * of every site of its business from when it is scheduled until
 * {@link SOCIAL_REF_DAYS} after it went out.
 *
 * Kept a short while per site so the beacon's steps don't each read the
 * table, and dropped at once when this API makes, archives or restores a
 * link ({@link forgetSiteLinkLabels}), so a link made a moment ago counts
 * its first visit. A second instance of the API would see a change within
 * {@link LINK_LABELS_TTL_MS}.
 */

/** How long after it went out a Saroh Social post's visits still count as its own. */
export const SOCIAL_REF_DAYS = 90;

/** How long a site's labels are kept before they are read again. */
export const LINK_LABELS_TTL_MS = 60 * 1000;

/** Sites kept at most; the oldest goes first. */
const MAX_SITES = 5000;

const cache = new Map<string, { at: number; labels: ReadonlySet<string> }>();

async function labelsOf(
    siteId: string,
    organizationId: string,
    now: number,
): Promise<ReadonlySet<string>> {
    const key = `${organizationId}:${siteId}`;
    const hit = cache.get(key);
    if (hit && now - hit.at < LINK_LABELS_TTL_MS) return hit.labels;
    const [rows, posts] = await Promise.all([
        prisma.siteLink.findMany({
            where: { siteId, organizationId, archivedAt: null },
            select: { label: true },
        }),
        prisma.socialPost.findMany({
            where: {
                organizationId,
                status: {
                    in: ["SCHEDULED", "PUBLISHING", "DONE", "PARTLY_DONE"],
                },
                publishAt: {
                    gte: new Date(now - SOCIAL_REF_DAYS * 86_400_000),
                },
            },
            select: { ref: true },
        }),
    ]);
    const labels = new Set([
        ...rows.map((r) => r.label),
        ...posts.map((p) => p.ref),
    ]);
    cache.delete(key);
    if (cache.size >= MAX_SITES) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(key, { at: now, labels });
    return labels;
}

/**
 * The step's `ref` as it may be counted: the label when it is one of the
 * site's live links, else null (the step counts under its group alone).
 */
export async function liveLinkLabel(
    site: { id: string; organizationId: string },
    ref: unknown,
    now: number = Date.now(),
): Promise<string | null> {
    const label = visitRefOf(ref);
    if (label === null) return null;
    const labels = await labelsOf(site.id, site.organizationId, now);
    return labels.has(label) ? label : null;
}

/** A site's links changed here: read them again on the next step. */
export function forgetSiteLinkLabels(
    siteId: string,
    organizationId: string,
): void {
    cache.delete(`${organizationId}:${siteId}`);
}

/** A business's Saroh Social posts changed: read every one of its sites' labels again. */
export function forgetOrganizationLinkLabels(organizationId: string): void {
    for (const key of [...cache.keys()]) {
        if (key.startsWith(`${organizationId}:`)) cache.delete(key);
    }
}

/** Tests only. */
export function forgetAllSiteLinkLabels(): void {
    cache.clear();
}
