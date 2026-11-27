import { z } from "zod";

import { defineRead } from "@/lib/query/define-read";
import type { DomainKey } from "@/lib/query/keys";
import { domainKey } from "@/lib/query/keys";
import { readDateRange } from "@/lib/views/date-range";

import type { StockAddress, StockTab } from "./list-query";
import { readStockPages } from "./list-query";
import { logKindId } from "./log";
import type { StockChecks, StockLevels, StockLog } from "./service";

/**
 * Stock's reads (DEC-259): the levels, the log and the checks, a page at a
 * time as the Stock screen's address asks, or whole for a sheet and a
 * product's Stock tab. Client-safe: the keys and the routes; the services
 * are paired in `access.ts`.
 */

/** Every Stock read of a business: what a stock change invalidates. */
export const stockKeys = (orgId: string): DomainKey =>
    domainKey("stock", orgId);

// As `route.ts` bounds them; that module is server-only.
const id = z.string().min(1).max(100).optional();
const page = z.coerce.number().int().min(1).max(10_000).optional();
const size = z.coerce.number().int().min(1).max(100).optional();
const day = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional();

/** Levels: a page of them (the screen), or every shelf (the sheets). */
export const stockLevelsRead = defineRead<StockLevels>()({
    key: (orgId, ask) => domainKey("stock", orgId, "levels", ask),
    route: {
        path: "/api/stock",
        params: {
            storefront: id,
            q: z.string().max(100).optional(),
            needs: z.enum(["1", "auto"]).optional(),
            sort: z.literal("need").optional(),
            page,
            size,
        },
    },
    tier: "records",
});

export type StockLevelsAsk = Parameters<typeof stockLevelsRead.options>[1];

/**
 * The log, newest first, with the screen's Product filter (`names`) or
 * without: every product's name, unread an empty list.
 */
export interface StockLogView extends StockLog {
    products?: { id: string; name: string }[];
}

/** The log: a page of it (the screen), or a product's latest `limit`. */
export const stockLogRead = defineRead<StockLogView>()({
    key: (orgId, ask) => domainKey("stock", orgId, "log", ask),
    route: {
        path: "/api/stock/log",
        params: {
            kind: z.string().max(40).optional(),
            storefront: id,
            product: id,
            date: z.string().max(20).optional(),
            from: day,
            to: day,
            page,
            size,
            limit: size,
            names: z.literal("1").optional(),
        },
    },
    tier: "records",
});

export type StockLogAsk = Parameters<typeof stockLogRead.options>[1];

/** The checks: a page of them, or with no page every open one. */
export const stockChecksRead = defineRead<StockChecks>()({
    key: (orgId, ask) => domainKey("stock", orgId, "checks", ask),
    route: { path: "/api/stock/checks", params: { page, size } },
    tier: "records",
});

export type StockChecksAsk = Parameters<typeof stockChecksRead.options>[1];

type Params = Record<string, string | string[] | undefined>;

const one = (params: Params, key: string) => {
    const v = params[key];
    return typeof v === "string" ? v : undefined;
};

/** What the Stock screen's address shows, and the reads that draw it. */
export interface StockView {
    address: StockAddress;
    levels: StockLevelsAsk;
    log: StockLogAsk;
    checks: StockChecksAsk;
}

/**
 * The Stock screen's address into what it shows and what it reads: one
 * pure function for the page's prefetch and the container's queries, so
 * the keys agree. `sizes`: each list's rows per page when the address
 * names none. A storefront that isn't the business's is no filter.
 */
export function stockView(
    params: Params,
    sizes: Partial<Record<StockTab, number>>,
    storefronts: readonly { id: string }[],
): StockView {
    const tab: StockTab =
        params.tab === "log" || params.tab === "checks" ? params.tab : "levels";
    // None chosen: what needs you while anything does, else everything
    // (DEC-266); the levels read says which (`needsShown`).
    const show = one(params, "show") ?? "";
    const q = (one(params, "q") ?? "").trim().slice(0, 100);
    const kind = logKindId(one(params, "kind"));
    const store = one(params, "store");
    const product = one(params, "product");
    const pages = readStockPages(params, sizes);
    const dates = readDateRange(params);
    const known = (s: string | undefined) =>
        s && storefronts.some((f) => f.id === s) ? s : undefined;
    return {
        address: {
            ...dates,
            tab,
            show,
            q,
            kind,
            store: store ?? "all",
            product: product ?? "",
            pages,
        },
        levels: {
            storefront: known(show),
            q: q || undefined,
            // A search looks through everything, as the shelf might be fine.
            needs:
                show === "needs" ? "1" : show === "" && !q ? "auto" : undefined,
            // Out first, then low, then the rest (DEC-266).
            sort: "need",
            ...pages.levels,
        },
        log: {
            kind: kind === "all" ? undefined : kind,
            storefront: known(store),
            product: product === "" ? undefined : product,
            date: dates.date ?? undefined,
            from: dates.from ?? undefined,
            to: dates.to ?? undefined,
            ...pages.log,
            names: "1",
        },
        checks: pages.checks,
    };
}

/** A product's Stock tab: its latest changes, and every open check. */
export const productLogAsk = (product: string): StockLogAsk => ({
    product,
    limit: 100,
});
export const ALL_CHECKS: StockChecksAsk = {};
