"use server";

import { apiFetch, orgBase } from "@/lib/api/http";
import { formatMoneyMajor } from "@/lib/format/money";
import type { Invoice } from "@/lib/invoices/service";
import type { OrderListPage } from "@/lib/orders/business-service";
import { orderListQuery } from "@/lib/orders/business-service";

import type { OwedBillRow } from "./owed-bills";
import { owedBills } from "./owed-bills";
import type { OwedAge } from "./reads";

/**
 * The reads behind Money's two sheets (DEC-171, plan U12, #1093): a week's
 * paid orders (`IBWeekD`, `IBWeekP`) and an age's unpaid bills (`IBOwedD`,
 * `IBOwedP`). Each answers `failed` rather than an empty list when the API
 * couldn't be read, and `denied` for a role the API turns away, so a sheet
 * never says "none" when it doesn't know. The API decides who may read.
 */

export type SheetRead<T> =
    { ok: true; data: T } | { ok: false; denied: boolean };

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** How many orders a week's sheet lists before "N more". */
const WEEK_ORDERS_SHOWN = 5;

/** One paid order in a week's sheet. */
export interface WeekOrderRow {
    id: string;
    /** "#1102 · Shruti Menon". */
    title: string;
    /** "Hill Road · Sourdough loaf, Croissants". */
    line: string;
    /** "₹11,250"; null for a role the API sends no money to. */
    amount: string | null;
}

async function read<T>(path: string): Promise<SheetRead<T>> {
    try {
        const res = await apiFetch(path);
        if (res.status === 403) return { ok: false, denied: true };
        if (!res.ok) return { ok: false, denied: false };
        return { ok: true, data: (await res.json()) as T };
    } catch {
        return { ok: false, denied: false };
    }
}

/**
 * The paid orders placed between two days, newest first, the first
 * {@link WEEK_ORDERS_SHOWN}, and how many there are in all.
 */
export async function readWeekOrders(
    from: string,
    to: string,
): Promise<SheetRead<{ rows: WeekOrderRow[]; total: number }>> {
    if (!DAY.test(from) || !DAY.test(to)) return { ok: false, denied: false };
    const base = await orgBase();
    if (!base) return { ok: false, denied: false };
    const page = await read<OrderListPage>(
        `${base}/orders?${orderListQuery({
            from,
            to,
            payment: "PAID",
            size: WEEK_ORDERS_SHOWN,
        })}`,
    );
    if (!page.ok) return page;
    return {
        ok: true,
        data: {
            total: page.data.counts.all,
            rows: page.data.rows.slice(0, WEEK_ORDERS_SHOWN).map((o) => {
                const who = o.customer?.name ?? o.walkIn?.name ?? "Walk-in";
                const products = o.productNames.join(", ");
                const more = o.moreProducts > 0 ? ` +${o.moreProducts}` : "";
                return {
                    id: o.id,
                    title: `#${o.orderId} · ${who}`,
                    line: products
                        ? `${o.store.name} · ${products}${more}`
                        : o.store.name,
                    amount:
                        o.total !== undefined
                            ? formatMoneyMajor(o.total, o.currency)
                            : null,
                };
            }),
        },
    };
}

const AGES: readonly OwedAge[] = ["notDue", "late1to30", "lateOver30"];

/**
 * The unpaid bills of one age, most late first: every issued invoice
 * (`?view=issued` and `?view=overdue`, as the Invoices list reads them),
 * aged as Money's figure ages them. `zone` is the business's, for the
 * due dates' words.
 */
export async function readOwedBills(
    age: OwedAge,
    zone: string,
): Promise<SheetRead<OwedBillRow[]>> {
    if (!AGES.includes(age)) return { ok: false, denied: false };
    const base = await orgBase();
    if (!base) return { ok: false, denied: false };
    const [issued, overdue] = await Promise.all([
        read<Invoice[]>(`${base}/invoices?view=issued`),
        read<Invoice[]>(`${base}/invoices?view=overdue`),
    ]);
    if (!issued.ok) return issued;
    if (!overdue.ok) return overdue;
    const byId = new Map<string, Invoice>();
    for (const i of [...issued.data, ...overdue.data]) byId.set(i.id, i);
    const all = Array.from(byId.values());
    let rows: OwedBillRow[];
    try {
        rows = owedBills(all, age, new Date(), zone);
    } catch {
        // An unknown zone: the days late still count; the dates in UTC.
        rows = owedBills(all, age, new Date(), "UTC");
    }
    return { ok: true, data: rows };
}
