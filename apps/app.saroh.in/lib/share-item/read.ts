import { hostsFor, urlOf } from "@saroh/edition";
import { cache } from "react";

import { env } from "@/env";
import { EDITION } from "@/lib/edition";
import { siteColours } from "@/lib/qr/colours";
import { pickShareSite } from "@/lib/qr/pick";
import { planMoney } from "@/lib/saroh-billing/money";
import { billingAccessOrNull, listAddons } from "@/lib/saroh-billing/service";
import { getSite, listSites } from "@/lib/sites/service";
import type { WebAddressLinks } from "@/lib/sites/share-links";

import type { ScheduleLock, ShareSetup } from "./share";
import { shareSwatches } from "./share";
import { sharePostsOn } from "./share-posts-switch";

/** The catalogue's module id Saroh Social's add-on will carry. */
const SOCIAL_MODULE = "social";

/**
 * What a Share button needs (#1375 U2), once per render. Server-only.
 *
 * Null while Share is switched off (`share-posts-switch.ts`), when there
 * is nothing live to share from, or when it can't be told
 * (no live site, a role that can't read the sites or the web address): the
 * Share button is then left out, never broken, as the QR button is.
 */
export const readShareSetup = cache(
    async (web: WebAddressLinks | null): Promise<ShareSetup | null> => {
        // Switched off (DEC-217): no Share button anywhere.
        if (!web || !sharePostsOn()) return null;
        const [sites, access] = await Promise.all([
            listSites().catch(() => []),
            billingAccessOrNull(),
        ]);
        const site = pickShareSite(sites, web.address);
        if (!site?.currentPublicationId) return null;
        // The colour row's swatches; without the read, the site's colours only.
        const detail = await getSite(site.id).catch(() => null);
        return {
            swatches: shareSwatches(siteColours(detail)),
            apiOrigin:
                env.NEXT_PUBLIC_API_URL ??
                env.NEXT_PUBLIC_BETTER_AUTH_URL ??
                urlOf(hostsFor(EDITION, "production").api),
            siteId: site.id,
            schedule:
                access?.plan?.id === "grow"
                    ? { tier: "grow", price: await socialPrice() }
                    : ({ tier: "free" } satisfies ScheduleLock),
        };
    },
);

/** Saroh Social's monthly price, from the catalogue's add-ons; never typed in. */
async function socialPrice(): Promise<string | null> {
    try {
        const read = await listAddons();
        if (read.status !== "ok" || !read.data) return null;
        const addon = read.data.addons.find((a) => a.module === SOCIAL_MODULE);
        return addon ? planMoney(addon.pricePaise) : null;
    } catch {
        return null;
    }
}
