import type { Prisma } from "@saroh/database";

import { siteOriginOf } from "../../sites/site-origin";
import {
    productPath,
    signWatchToken,
    stopWaitingPath,
} from "../../stock/stock-watch-rules";
import { siteCodeSecret } from "../site-secrets";
import type { NoticeSubject } from "./notice";
import { defineNotice } from "./notice";

/**
 * Back in stock's two emails, to the address a "Tell me" watch holds:
 *
 * - **"We'll email you when ‹product› is back"** (BACK_IN_STOCK_WAITING,
 *   DEC-178, #1170): right after a "Tell me" made the watch
 *   (`stock-watch.service.ts`), keyed `back-in-stock-waiting:<id>`. Only
 *   when that address had no other watch waiting at this business, so
 *   typing someone's address over and over never mails them more than once
 *   while they wait (the per-visitor and per-address limits apply too).
 * - **"‹Product› is back at ‹Business›"** (BACK_IN_STOCK, DEC-174 U23,
 *   #1154): the one email when it can be bought again. Queued by the
 *   `stock.back-in-stock` run (`stock/back-in-stock.handler.ts`) once the
 *   stock has stayed sellable for ten minutes, one `customer.notify` per
 *   watch, keyed `back-in-stock:<id>`.
 *
 * Both are email only, to the watch's own address (`STOCK_WATCH`
 * recipient): the person may be no contact at all, and their opt-in made
 * them none. Only through the business's own provider, behind the
 * BACK_IN_STOCK switch. A contact that already had the address is named on
 * the watch, so their revoked email consent still stops it. Each is read
 * again when it runs: a watch stopped since tells nobody.
 *
 * Both carry "Stop waiting" (DEC-178): the stop page on the site the watch
 * was taken on, with its signed token (`stock-watch-rules.ts`). The token
 * is a credential, so it is a secret link: the stored body holds the slot,
 * and the link is sealed into the send job and put in only when the email
 * goes. A site with no address now: no stop link, and no "We'll email
 * you" at all.
 */

type Tx = Prisma.TransactionClient;

export interface BackInStockVars {
    business: string;
    /** "Linen shirt", or "Linen shirt (Blue / M)" for one option. */
    product: string;
    /** The product's page on the site it was asked on; null: none now. */
    link: string | null;
    /**
     * The origin of the site it was asked on, where the stop page is;
     * null: none now, so no stop link. Not a secret: the token is added
     * only at send time.
     */
    site: string | null;
}

export interface BackInStockNotice {
    kind: "BACK_IN_STOCK";
    stock: BackInStockVars;
}

export interface BackInStockWaitingNotice {
    kind: "BACK_IN_STOCK_WAITING";
    stock: BackInStockVars;
}

/** The watch as both emails read it, with its site's address. */
async function readWatch(tx: Tx, organizationId: string, watchId: string) {
    const watch = await tx.stockWatch.findFirst({
        where: { id: watchId, organizationId },
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
    if (!watch) return null;
    // The email goes without its links rather than not at all.
    const site = await siteOriginOf(
        organizationId,
        { siteId: watch.siteId },
        tx,
    ).catch(() => null);
    const stock: BackInStockVars = {
        business: watch.organization.name,
        product: watch.variant
            ? `${watch.product.name} (${watch.variant.title})`
            : watch.product.name,
        link: site ? `${site}${productPath(watch.product.slug)}` : null,
        site,
    };
    return { watch, stock };
}

const STOP_LEAD = "Changed your mind? Stop waiting here:";

/**
 * "Stop waiting": the stop page for this watch, on its site. Made at send
 * time only; never stored, never logged.
 */
function stopLink(
    subject: NoticeSubject<BackInStockNotice | BackInStockWaitingNotice>,
): Promise<string> {
    const { site } = subject.vars.stock;
    const watchId = subject.recipient?.watchId;
    if (!site || !watchId) {
        // `lead` was null for these, so this is never asked for.
        return Promise.reject(
            new Error("A stop link needs a site and a watch"),
        );
    }
    return Promise.resolve(
        `${site}${stopWaitingPath(signWatchToken(siteCodeSecret(), watchId))}`,
    );
}

export const backInStockNotice = defineNotice<BackInStockNotice>({
    setting: "BACK_IN_STOCK",
    emailOnly: true,
    load: async (tx, organizationId, payload) => {
        if (payload.kind !== "BACK_IN_STOCK" || !payload.stockWatchId) {
            return null;
        }
        const read = await readWatch(tx, organizationId, payload.stockWatchId);
        // Only a watch the run marked told, and nobody stopped since.
        if (!read?.watch.toldAt || read.watch.cancelledAt) return null;
        return {
            contactId: read.watch.contactId,
            recipient: { kind: "STOCK_WATCH", watchId: read.watch.id },
            vars: { kind: "BACK_IN_STOCK", stock: read.stock },
        };
    },
    sentence: ({ stock }) =>
        `${stock.product} is back at ${stock.business}. You asked us to tell you, and this is the last email you'll get about it.`,
    subject: ({ stock }) => `${stock.product} is back at ${stock.business}`,
    links: ({ stock }) =>
        stock.link ? [{ lead: "See it here:", url: stock.link }] : [],
    names: ({ stock }) => ({ business: stock.business, firstName: null }),
    secretLink: {
        lead: ({ stock }) => (stock.site ? STOP_LEAD : null),
        make: (_tx, _organizationId, subject) => stopLink(subject),
    },
});

export const backInStockWaitingNotice = defineNotice<BackInStockWaitingNotice>({
    setting: "BACK_IN_STOCK",
    emailOnly: true,
    load: async (tx, organizationId, payload) => {
        if (payload.kind !== "BACK_IN_STOCK_WAITING" || !payload.stockWatchId) {
            return null;
        }
        const read = await readWatch(tx, organizationId, payload.stockWatchId);
        // Still waiting: stopped since, or already told, says nothing.
        if (!read || read.watch.toldAt || read.watch.cancelledAt) {
            return null;
        }
        // Its point is the way to stop: with no site to stop on, none.
        if (!read.stock.site) return null;
        return {
            contactId: read.watch.contactId,
            recipient: { kind: "STOCK_WATCH", watchId: read.watch.id },
            vars: { kind: "BACK_IN_STOCK_WAITING", stock: read.stock },
        };
    },
    sentence: ({ stock }) =>
        `You asked ${stock.business} to tell you when ${stock.product} is back. We'll email you once when it is, and that's all.`,
    subject: ({ stock }) => `We'll email you when ${stock.product} is back`,
    names: ({ stock }) => ({ business: stock.business, firstName: null }),
    secretLink: {
        lead: ({ stock }) => (stock.site ? STOP_LEAD : null),
        make: (_tx, _organizationId, subject) => stopLink(subject),
    },
});
