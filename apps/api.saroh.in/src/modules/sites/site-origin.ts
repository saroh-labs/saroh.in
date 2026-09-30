import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import { env } from "../../env";

/**
 * Where a business's own site lives, as `https://host` with no trailing
 * slash (round-2 D12): its verified custom domain when it has one, else its
 * platform subdomain on the renderer's apex (`northwind.saroh.app`). Null
 * when the business has no published site.
 *
 * The site is the one named (the customer's, for an account), else the
 * business's first published one — the one the pay page
 * takes its theme from (`public-invoices.service.ts`). A customer who has
 * finished setting up autopay lands here, on the merchant's own site, never
 * on Saroh's or the provider's page.
 */
export async function siteOriginOf(
    organizationId: string,
    opts: { siteId?: string } = {},
    db: Pick<Prisma.TransactionClient, "site" | "domain"> = prisma,
): Promise<string | null> {
    const site = await db.site.findFirst({
        where: {
            organizationId,
            ...(opts.siteId ? { id: opts.siteId } : {}),
            deletedAt: null,
            currentPublicationId: { not: null },
        },
        orderBy: { createdAt: "asc" },
        select: { id: true, subdomain: true },
    });
    if (!site) return null;
    const domain = await db.domain.findFirst({
        where: { organizationId, siteId: site.id, status: "VERIFIED" },
        orderBy: { verifiedAt: "asc" },
        select: { hostname: true },
    });
    if (domain) return `https://${domain.hostname}`;
    return site.subdomain
        ? `https://${site.subdomain}.${rendererHost()}`
        : null;
}

/** The renderer's apex host: `saroh.app`, or `saroh.app.localhost` in dev. */
export function rendererHost(): string {
    const base =
        env.RENDERER_URL ??
        (env.NODE_ENV === "development"
            ? "https://saroh.app.localhost"
            : "https://saroh.app");
    try {
        return new URL(base).host;
    } catch {
        return "saroh.app";
    }
}
