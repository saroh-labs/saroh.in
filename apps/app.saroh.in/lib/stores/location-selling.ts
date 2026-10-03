import { apiFetch, getActiveOrgId } from "@/lib/api/http";
import type { SiteSelling } from "@/lib/sites/sells-from";
import type { SiteDetail, SiteSummary } from "@/lib/sites/service";
import { siteAddressOf } from "@/lib/sites/share-links";
import {
    readWebAddressLinks,
    RENDERER_APEX,
} from "@/lib/sites/share-links-read";

/**
 * The website facts each location's "Sells in person only / and online"
 * line reads (DEC-069, L9). Server-only.
 *
 * - `{ known: true, site: null }`: the business has no website (or Website
 *   is off, when the sites routes answer 404), so nothing sells online.
 * - `{ known: false }`: the site couldn't be read — a role the API won't
 *   show it to, or a failure. The screen then says nothing rather than
 *   claim "in person only".
 *
 * Tolerant on purpose, never `getJson`: its 403 throws `forbidden()`, and
 * a location's own settings must not become a 403 page because the viewer
 * can't read the website.
 *
 * The origin is where customers reach the site (`siteAddressOf`, DEC-069
 * L8): the business's verified custom domain when it has one.
 */
export async function readSiteSelling(): Promise<
    { known: true; site: SiteSelling | null } | { known: false }
> {
    const orgId = await getActiveOrgId();
    if (!orgId) return { known: false };
    const base = `/organizations/${orgId}/sites`;
    try {
        const list = await apiFetch(base);
        if (list.status === 404) return { known: true, site: null };
        if (!list.ok) return { known: false };
        // One website per business (ADR-006).
        const summary = ((await list.json()) as SiteSummary[]).at(0);
        if (!summary) return { known: true, site: null };

        const [one, webAddress] = await Promise.all([
            apiFetch(`${base}/${encodeURIComponent(summary.id)}`),
            readWebAddressLinks(),
        ]);
        if (!one.ok) return { known: false };
        const site = (await one.json()) as SiteDetail;
        const live = Boolean(
            site.currentPublication ?? site.currentPublicationId,
        );
        return {
            known: true,
            site: {
                siteId: site.id,
                sellsFrom: site.sellsFrom ?? null,
                origin: live
                    ? (siteAddressOf(site, webAddress, RENDERER_APEX)?.url ??
                      null)
                    : null,
            },
        };
    } catch {
        return { known: false };
    }
}
