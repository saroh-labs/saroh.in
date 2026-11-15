/**
 * The load test's data (README): the quality test's clothing shop,
 * Threadline Studio (`plan.ts`: its catalogue, sizes and colours, two
 * stores, team), at scale: ~1,000 orders a day for 90 days, 2 to 5 lines
 * each, both stores and online, ~3% cancelled and ~10% discounted, busy
 * hours and weekends; ~6,000 customers (regulars, occasional, one-timers,
 * lapsed); every sale and each morning's delivery in the stock log; and
 * the invoice Saroh writes for every paid order (PAID, source ORDER, the
 * order being the ledger). Made-up people only.
 *
 * Only into a database on this machine named `saroh-ai-load`, empty of it.
 */
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";
import { DateTime } from "luxon";

import { assertLocalDev } from "../../../src/cli/ask";
import type { OrderPlan, Person, ProductPlan } from "../plan";
import { anchorFor, buildPlan, dayAt, idOf, ZONE } from "../plan";
import {
    addAskAiRow,
    flagsOf,
    modulesOf,
    orgIdOf,
    seedBusiness,
} from "../seed";

const TAG = "[load seed]";
export const LOAD_DATABASE = "saroh-ai-load";
export const DAYS = 90;
const PER_DAY = 1000;
const CUSTOMERS = { regular: 500, occasional: 1500, once: 2800, lapsed: 1200 };

/** The load database, or a throw: local, and named exactly. */
export function assertLoadDatabase() {
    const target = assertLocalDev();
    if (target.database !== LOAD_DATABASE) {
        throw new Error(
            `Refusing: the database is "${target.database}"; the load test only runs against "${LOAD_DATABASE}".`,
        );
    }
    return target;
}

/** A small seeded random source (mulberry32), so a reseed lays out the same. */
export function rngOf(seed: number) {
    let a = seed >>> 0;
    const next = () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return {
        next,
        int: (lo: number, hi: number) =>
            lo + Math.floor(next() * (hi - lo + 1)),
        pick: <T>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)],
    };
}
type Rng = ReturnType<typeof rngOf>;

function byWeight<T extends { weight: number }>(rng: Rng, xs: readonly T[]): T {
    let r = rng.next() * xs.reduce((n, x) => n + x.weight, 0);
    for (const x of xs) {
        r -= x.weight;
        if (r <= 0) return x;
    }
    return xs[0];
}

const FIRST = [
    "Aarav",
    "Diya",
    "Kabir",
    "Ira",
    "Vihaan",
    "Anaya",
    "Reyansh",
    "Myra",
    "Arjun",
    "Sara",
    "Ishaan",
    "Kiara",
    "Dhruv",
    "Aanya",
    "Rohan",
    "Tara",
    "Neel",
    "Riya",
    "Yash",
    "Zoya",
];
const LAST = [
    "Mehta",
    "Shah",
    "Patel",
    "Desai",
    "Joshi",
    "Trivedi",
    "Parikh",
    "Modi",
    "Rao",
    "Iyer",
    "Khan",
    "Sethi",
    "Bose",
    "Nair",
    "Kulkarni",
    "Gill",
];

export type Segment = keyof typeof CUSTOMERS;

/** Made-up customers: example.com addresses, phones no one has. */
export function makeCustomers(rng: Rng): (Person & { segment: Segment })[] {
    const out: (Person & { segment: Segment })[] = [];
    let n = 0;
    for (const [segment, count] of Object.entries(CUSTOMERS) as [
        Segment,
        number,
    ][]) {
        for (let i = 0; i < count; i++, n++) {
            const first = rng.pick(FIRST);
            const last = rng.pick(LAST);
            out.push({
                key: `c${n}`,
                first,
                last,
                email: `${first}.${last}.${n}@example.com`.toLowerCase(),
                phone: `+91 90000 ${String(n).padStart(5, "0")}`,
                segment,
            });
        }
    }
    return out;
}

/** 0 Sunday … 6 Saturday: weekends lift. */
const DAY_LIFT = [1.25, 0.9, 0.9, 0.9, 0.9, 1.0, 1.3];
/** Opening hours 10:00 to 21:59: lunch and evening peaks. */
const HOURS = [3, 5, 8, 9, 7, 5, 5, 6, 9, 10, 8, 4].map((weight, i) => ({
    hour: 10 + i,
    weight,
}));

/** The 90 days of orders, oldest first, numbered ORD-000001 on. */
export function makeOrders(
    anchor: Date,
    now: Date,
    rng: Rng,
    products: ProductPlan[],
    customers: (Person & { segment: Segment })[],
): OrderPlan[] {
    const of = (s: Segment) => customers.filter((c) => c.segment === s);
    const regular = of("regular");
    const occasional = of("occasional");
    const once = of("once");
    const lapsed = of("lapsed");
    const price = new Map(products.map((p) => [p.key, p.price]));
    const out: Omit<OrderPlan, "number">[] = [];
    let n = 0;
    for (let d = -(DAYS - 1); d <= 0; d++) {
        const weekday =
            DateTime.fromJSDate(dayAt(anchor, d), { zone: ZONE }).weekday % 7;
        const count = Math.round(
            PER_DAY * DAY_LIFT[weekday] * (0.9 + rng.next() * 0.2),
        );
        for (let i = 0; i < count; i++) {
            const at = dayAt(
                anchor,
                d,
                byWeight(rng, HOURS).hour * 60 + rng.int(0, 59),
            );
            if (at > now) continue;
            const r = rng.next();
            const online = r < 0.2;
            const store = online || r < 0.65 ? "main" : "second";
            // Who: online always known; at the counter 40% are.
            let who: Person | null = null;
            if (online || rng.next() < 0.4) {
                const s = rng.next();
                who =
                    s < 0.45
                        ? rng.pick(regular)
                        : s < 0.7
                          ? rng.pick(occasional)
                          : s < 0.85 && d < -60
                            ? rng.pick(lapsed)
                            : (once.pop() ?? rng.pick(occasional));
            }
            const items: OrderPlan["items"] = [];
            for (let l = rng.int(2, 5); l > 0; l--) {
                const p = byWeight(rng, products);
                items.push({
                    product: p.key,
                    qty: rng.next() < 0.85 ? 1 : 2,
                    ...(p.variants
                        ? { variant: byWeight(rng, p.variants).key }
                        : {}),
                });
            }
            const lines = items.reduce(
                (s, it) => s + (price.get(it.product) ?? 0) * it.qty,
                0,
            );
            const cancelled = d < 0 && rng.next() < 0.03;
            const discount =
                rng.next() < 0.1 ? Math.round(lines * 0.1) : undefined;
            out.push({
                key: `l${n++}`,
                customer: who?.key ?? null,
                walkIn: who ? null : "Walk-in customer",
                items,
                at,
                paid: !cancelled,
                stage:
                    d === 0
                        ? rng.pick(["NEW", "PREPARING", "READY"] as const)
                        : cancelled
                          ? "NEW"
                          : online
                            ? "DELIVERED"
                            : "COLLECTED",
                store,
                ...(online ? { online } : {}),
                ...(cancelled ? { cancelled } : {}),
                ...(discount ? { discount } : {}),
            });
        }
    }
    return out
        .sort(
            (a, b) =>
                a.at.getTime() - b.at.getTime() || a.key.localeCompare(b.key),
        )
        .map((o, i) => ({
            ...o,
            number: `ORD-${String(i + 1).padStart(6, "0")}`,
        }));
}

/** Shelves that stop being restocked for the last days, so some sizes end low or out. */
const RUNS_DOWN = new Set([
    "kurta_xl@second",
    "jeans_w34@main",
    "jeans_w34@second",
    "dupatta_mustard@main",
    "shirt_xl@main",
]);
const RUN_DOWN_DAYS = 12;

interface Shelf {
    key: string;
    store: string;
    product: string;
    variant?: string;
    onHand: number;
    soldYesterday: number;
}

/**
 * The stock log: each morning's delivery (topped up to twice yesterday's
 * sales, plus 30) and every sale, oldest first; a shelf that's out sells
 * nothing more from it. Sets each plan shelf's on hand to where it ends.
 */
export function makeStock(
    anchor: Date,
    products: ProductPlan[],
    orders: OrderPlan[],
) {
    const shelves = new Map<string, Shelf>();
    const shelfOf = (
        product: string,
        variant: string | undefined,
        store: string,
    ) => {
        const key = `${product}${variant ? `_${variant}` : ""}@${store}`;
        let s = shelves.get(key);
        if (!s) {
            s = { key, store, product, variant, onHand: 0, soldYesterday: 60 };
            shelves.set(key, s);
        }
        return s;
    };
    for (const p of products)
        for (const store of ["main", "second"])
            for (const v of p.variants ?? [undefined])
                shelfOf(p.key, v?.key, store);
    const entries: {
        shelf: Shelf;
        kind: "SOLD" | "RECEIVED";
        quantity: number;
        before: number;
        at: Date;
        order?: string;
    }[] = [];
    let at = 0;
    for (let d = -(DAYS - 1); d <= 0; d++) {
        const morning = dayAt(anchor, d, 9 * 60);
        for (const s of shelves.values()) {
            const frozen = RUNS_DOWN.has(s.key) && d > -RUN_DOWN_DAYS;
            const want = Math.ceil((2 * s.soldYesterday + 30) / 10) * 10;
            if (!frozen && s.onHand < want) {
                entries.push({
                    shelf: s,
                    kind: "RECEIVED",
                    quantity: want - s.onHand,
                    before: s.onHand,
                    at: morning,
                });
                s.onHand = want;
            }
            s.soldYesterday = 0;
        }
        const end = dayAt(anchor, d + 1);
        for (; at < orders.length && orders[at].at < end; at++) {
            const o = orders[at];
            if (o.cancelled) continue;
            for (const it of o.items) {
                const s = shelfOf(it.product, it.variant, o.store ?? "main");
                const qty = Math.min(it.qty, s.onHand);
                if (qty === 0) continue;
                entries.push({
                    shelf: s,
                    kind: "SOLD",
                    quantity: -qty,
                    before: s.onHand,
                    at: o.at,
                    order: o.key,
                });
                s.onHand -= qty;
                s.soldYesterday += qty;
            }
        }
    }
    for (const p of products) {
        if (p.variants) {
            for (const v of p.variants)
                v.stock = {
                    main: shelfOf(p.key, v.key, "main").onHand,
                    second: shelfOf(p.key, v.key, "second").onHand,
                };
            p.onHand = p.variants.reduce((n, v) => n + v.stock.main, 0);
        } else {
            p.onHand = shelfOf(p.key, undefined, "main").onHand;
            p.stockAt = { second: shelfOf(p.key, undefined, "second").onHand };
        }
    }
    return entries;
}

/** Rows per insert under Postgres' 65,535 bound values. */
async function inserts<T extends object>(
    rows: T[],
    write: (rows: T[]) => Promise<unknown>,
) {
    if (!rows.length) return;
    const size = Math.max(1, Math.floor(60_000 / Object.keys(rows[0]).length));
    for (let i = 0; i < rows.length; i += size)
        await write(rows.slice(i, i + size));
}

export async function main(): Promise<number> {
    const target = assertLoadDatabase();
    console.info(`${TAG} database: ${target.database} on ${target.host}`);
    if (
        (await prisma.organization.count({
            where: { slug: "eval-clothing" },
        })) > 0
    ) {
        console.error(
            `${TAG} already seeded: drop the database and make it again.`,
        );
        return 2;
    }
    const started = performance.now();
    const now = new Date();
    const anchor = anchorFor(now);
    const biz = buildPlan(anchor).find((b) => b.key === "clothing");
    if (!biz) throw new Error("no clothing shop in the plan");
    const rng = rngOf(2026_11_14);
    const customers = makeCustomers(rng);
    biz.customers = customers;
    biz.orders = makeOrders(anchor, now, rng, biz.products, customers);
    const stock = makeStock(anchor, biz.products, biz.orders);

    const base = await prisma.subscription.findFirst({
        where: { organization: { slug: "demo-org" } },
        select: { planId: true, plan: { select: { version: true } } },
    });
    if (base) await addAskAiRow(base.plan.version);
    for (const key of flagsOf(modulesOf(biz))) {
        await prisma.featureFlag.upsert({
            where: { key },
            update: {},
            create: { id: `flag_${key}`, key, enabledByDefault: false },
        });
    }
    await seedBusiness(biz, anchor, base?.planId ?? null);
    console.info(
        `${TAG} business, ${customers.length} customers, ${biz.orders.length} orders in ${Math.round(performance.now() - started)} ms`,
    );

    // --- the stock log
    const org = orgIdOf("clothing");
    const id = (kind: string, key: string | number) =>
        idOf("clothing", kind, key);
    const levelId = (s: Shelf) =>
        id(
            "stock",
            `${s.product}${s.variant ? `_${s.variant}` : ""}${s.store === "main" ? "" : `_${s.store}`}`,
        );
    await inserts(
        stock.map((e, i): Prisma.StockEntryCreateManyInput => ({
            id: id("stockentry", i),
            organizationId: org,
            stockLevelId: levelId(e.shelf),
            storeId: id("store", e.shelf.store),
            productId: id("product", e.shelf.product),
            variantId: e.shelf.variant
                ? id("variant", `${e.shelf.product}_${e.shelf.variant}`)
                : null,
            kind: e.kind,
            quantity: e.quantity,
            before: e.before,
            after: e.before + e.quantity,
            orderId: e.order ? id("order", e.order) : null,
            createdAt: e.at,
        })),
        (data) => prisma.stockEntry.createMany({ data }),
    );
    console.info(`${TAG} ${stock.length} stock log entries`);

    // --- the invoice Saroh writes for each paid order
    const price = new Map(biz.products.map((p) => [p.key, p]));
    const people = new Map(customers.map((c) => [c.key, c]));
    const invoices: Prisma.InvoiceCreateManyInput[] = [];
    const lines: Prisma.InvoiceLineCreateManyInput[] = [];
    for (const o of biz.orders) {
        if (!o.paid) continue;
        const n = invoices.length + 1;
        const invoiceId = id("orderinvoice", n);
        const who = o.customer ? people.get(o.customer) : undefined;
        let position = 0;
        let subtotal = 0;
        for (const it of o.items) {
            const p = price.get(it.product);
            if (!p) continue;
            const variant = p.variants?.find(
                (v) => v.key === it.variant,
            )?.label;
            subtotal += p.price * it.qty;
            lines.push({
                id: id("orderinvoiceline", `${n}_${position}`),
                organizationId: org,
                invoiceId,
                position: position++,
                description: variant ? `${p.name} · ${variant}` : p.name,
                quantity: it.qty,
                unitPrice: p.price,
                amount: p.price * it.qty,
            });
        }
        if (o.discount) {
            lines.push({
                id: id("orderinvoiceline", `${n}_${position}`),
                organizationId: org,
                invoiceId,
                position,
                description: "Discount",
                quantity: 1,
                unitPrice: -o.discount,
                amount: -o.discount,
            });
        }
        const total = subtotal - (o.discount ?? 0);
        invoices.push({
            id: invoiceId,
            organizationId: org,
            number: `INV-${String(n).padStart(6, "0")}`,
            status: "PAID",
            kind: "INVOICE",
            source: "ORDER",
            orderId: id("order", o.key),
            contactId: who ? id("customer", who.key) : null,
            billToName: who ? `${who.first} ${who.last}` : o.walkIn,
            billToEmail: who?.email ?? null,
            sellerName: biz.name,
            currency: "INR",
            subtotal: total,
            total,
            issuedAt: o.at,
            paidAt: o.at,
            paymentMethod: "ORDER",
            paymentNote: `Paid on order ${o.number}`,
            createdAt: o.at,
            updatedAt: o.at,
        });
    }
    await inserts(invoices, (data) => prisma.invoice.createMany({ data }));
    await inserts(lines, (data) => prisma.invoiceLine.createMany({ data }));
    await prisma.invoiceSequence.create({
        data: {
            organizationId: org,
            series: "INV",
            lastNumber: invoices.length,
        },
    });
    await prisma.$executeRawUnsafe("ANALYZE");
    console.info(`${TAG} ${invoices.length} invoices, ${lines.length} lines`);
    console.info(
        `${TAG} done in ${Math.round(performance.now() - started)} ms; run date ${anchor.toISOString()} (midnight ${ZONE})`,
    );
    return 0;
}
