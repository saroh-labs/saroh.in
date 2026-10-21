import { siteOriginOf } from "../../sites/site-origin";
import { productPath } from "../../stock/stock-watch-rules";
import { defineNotice } from "./notice";

/**
 * "‹Product› is back at ‹Business›" (DEC-174 U23, #1154): the one email a
 * customer who pressed "Tell me" on a sold-out product gets when it can be
 * bought again. Queued by the `stock.back-in-stock` run
 * (`stock/back-in-stock.handler.ts`) once the stock has stayed sellable for
 * ten minutes, one `customer.notify` per watch, keyed `back-in-stock:<id>`.
 *
 * Email only, to the address the watch holds (`STOCK_WATCH` recipient): the
 * person may be no contact at all, and their opt-in made them none. Only
 * through the business's own provider, behind the BACK_IN_STOCK switch. A
 * contact that already had the address is named on the watch, so their
 * revoked email consent still stops it.
 *
 * Read again when it runs: a watch stopped since tells nobody. It is the
 * only email the watch sends, and says so, so it carries no stop link; the
 * site offers "Stop waiting" while it waits (`stock-watch.service.ts`).
 */

export interface BackInStockVars {
    business: string;
    /** "Linen shirt", or "Linen shirt (Blue / M)" for one option. */
    product: string;
    /** The product's page on the site it was asked on; null: none now. */
    link: string | null;
}

export interface BackInStockNotice {
    kind: "BACK_IN_STOCK";
    stock: BackInStockVars;
}

export const backInStockNotice = defineNotice<BackInStockNotice>({
    setting: "BACK_IN_STOCK",
    emailOnly: true,
    load: async (tx, organizationId, payload) => {
        if (payload.kind !== "BACK_IN_STOCK" || !payload.stockWatchId) {
            return null;
        }
        const watch = await tx.stockWatch.findFirst({
            where: { id: payload.stockWatchId, organizationId },
            select: {
                id: true,
                contactId: true,
                siteId: true,
                toldAt: true,
                cancelledAt: true,
                product: { select: { name: true, slug: true } },
                variant: { select: { title: true } },
                organization: { select: { name: true } },
            },
        });
        // Only a watch the run marked told, and nobody stopped since.
        if (!watch?.toldAt || watch.cancelledAt) return null;
        // The email goes without its link rather than not at all.
        const origin = await siteOriginOf(
            organizationId,
            { siteId: watch.siteId },
            tx,
        ).catch(() => null);
        const link = origin
            ? `${origin}${productPath(watch.product.slug)}`
            : null;
        return {
            contactId: watch.contactId,
            recipient: { kind: "STOCK_WATCH", watchId: watch.id },
            vars: {
                kind: "BACK_IN_STOCK",
                stock: {
                    business: watch.organization.name,
                    product: watch.variant
                        ? `${watch.product.name} (${watch.variant.title})`
                        : watch.product.name,
                    link,
                },
            },
        };
    },
    sentence: ({ stock }) =>
        `${stock.product} is back at ${stock.business}. You asked us to tell you, and this is the only email you'll get about it.`,
    subject: ({ stock }) => `${stock.product} is back at ${stock.business}`,
    links: ({ stock }) =>
        stock.link ? [{ lead: "See it here:", url: stock.link }] : [],
    names: ({ stock }) => ({ business: stock.business, firstName: null }),
});
