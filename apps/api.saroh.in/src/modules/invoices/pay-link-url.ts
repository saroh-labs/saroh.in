import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { FlagKey } from "../feature-flags/flags";
import { rendererBase, siteOriginOf } from "../sites/site-origin";

/**
 * Where a customer opens an invoice's pay link: the merchant-site renderer's
 * own apex, `/pay/<token>`. The apex link every link issued before DEC-069
 * carries, and still the fallback of {@link payLinkUrlFor}. Kept out of the
 * service so the modules that issue invoices do not load the app's env.
 */
export function payLinkUrl(token: string): string {
    return `${rendererBase()}/pay/${token}`;
}

/**
 * Where a customer opens an order's pay link (plan B, B11): the same apex,
 * `/pay/o/<token>` — an order's page, not an invoice's.
 */
export function orderPayLinkUrl(token: string): string {
    return `${rendererBase()}/pay/o/${token}`;
}

// Stateless (it reads the flag rows on every call), as in `sells-from.ts`.
const flags = new FeatureFlagService();

type OriginDb = Pick<Prisma.TransactionClient, "site" | "domain">;

/**
 * The canonical link of an invoice's pay page (DEC-069, R9; plan L6/L7):
 * `<origin>/pay/<token>` on the business's own address — its verified
 * custom domain, else its subdomain ({@link siteOriginOf}) — and the apex
 * link while the business has no live site.
 *
 * Behind the `PAY_LINK_ON_SITE` rollout flag, which fails closed: off, it
 * is exactly {@link payLinkUrl}. The renderer's tenant pay pages (L6) must
 * be live before it goes on. The renderer also sends a pay page opened on
 * any other host here, so this is the one answer to "where does this link
 * live".
 */
export async function payLinkUrlFor(
    organizationId: string,
    token: string,
    db: OriginDb = prisma,
): Promise<string> {
    const origin = await payOrigin(organizationId, db);
    return origin ? `${origin}/pay/${token}` : payLinkUrl(token);
}

/** {@link payLinkUrlFor} for an order's pay link: `<origin>/pay/o/<token>`. */
export async function orderPayLinkUrlFor(
    organizationId: string,
    token: string,
    db: OriginDb = prisma,
): Promise<string> {
    const origin = await payOrigin(organizationId, db);
    return origin ? `${origin}/pay/o/${token}` : orderPayLinkUrl(token);
}

/** The business's own origin for pay links, or null for the apex. */
async function payOrigin(
    organizationId: string,
    db: OriginDb,
): Promise<string | null> {
    if (!(await flags.isEnabled(FlagKey.PAY_LINK_ON_SITE, organizationId))) {
        return null;
    }
    return siteOriginOf(organizationId, {}, db);
}
