import { cache } from "react";

import { env } from "@/env";
import { pickShareSite } from "@/lib/qr/pick";
import { planMoney } from "@/lib/saroh-billing/money";
import { billingAccessOrNull, listAddons } from "@/lib/saroh-billing/service";
import { listSites } from "@/lib/sites/service";
import type { WebAddressLinks } from "@/lib/sites/share-links";

import type { ScheduleLock, ShareSetup } from "./share";

/** The catalogue's module id Saroh Social's add-on will carry. */
const SOCIAL_MODULE = "social";

/**
 * What a Share button needs (#1375 U2), once per render. Server-only.
 *
 * Null when there is nothing live to share from, or it can't be told
 * (no live site, a role that can't read the sites or the web address): the
 * Share button is then left out, never broken, as the QR button is.
 */
export const readShareSetup = cache(
    async (web: WebAddressLinks | null): Promise<ShareSetup | null> => {
        if (!web) return null;
        const [sites, access] = await Promise.all([
            listSites().catch(() => []),
            billingAccessOrNull(),
        ]);
        const site = pickShareSite(sites, web.address);
        if (!site?.currentPublicationId) return null;
        return {
            apiOrigin:
                env.NEXT_PUBLIC_API_URL ??
                env.NEXT_PUBLIC_BETTER_AUTH_URL ??
                "https://api.saroh.in",
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
