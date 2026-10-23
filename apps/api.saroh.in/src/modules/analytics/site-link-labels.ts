import { prisma } from "@saroh/database";

import { visitRefOf } from "./visit-source";

/**
 * The live link labels of one site (DEC-181), as the public intake checks
 * a visit step's `ref` against them: a label is kept only when it is one
 * of the links the business made in Saroh for that site, never another
 * business's, never an archived one.
 *
 * Kept a short while per site so the beacon's steps don't each read the
 * table, and dropped at once when this API makes, archives or restores a
 * link ({@link forgetSiteLinkLabels}), so a link made a moment ago counts
 * its first visit. A second instance of the API would see a change within
 * {@link LINK_LABELS_TTL_MS}.
 */

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
    const rows = await prisma.siteLink.findMany({
        where: { siteId, organizationId, archivedAt: null },
        select: { label: true },
    });
    const labels = new Set(rows.map((r) => r.label));
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

/** Tests only. */
export function forgetAllSiteLinkLabels(): void {
    cache.clear();
}
