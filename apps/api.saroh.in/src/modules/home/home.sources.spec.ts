import type { ModuleAvailabilityService } from "../capabilities/module-availability.service";
import type { OrgAction } from "../organizations/organization-actions";
import type { StockCheck } from "../stock/stock-checks.service";
import { overdueTag } from "./home-model";
import type { RenewalSignal } from "./home-money-sources";
import {
    failedRenewals,
    overdueInvoices,
    renewalTag,
} from "./home-money-sources";
import { sitesNotLive, stockShort } from "./home-site-stock-sources";
import { HomeService } from "./home.service";

/**
 * Home's Needs-you sources from round 2, F1: failed renewals, overdue
 * invoices, stock short for orders and websites that aren't live. Mocked
 * Prisma; `home.sources.db.spec.ts` runs the same queries against Postgres.
 */

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-09-27T06:00:00.000Z");
const ago = (ms: number, from = NOW) => new Date(from.getTime() - ms);

const MEERA = { firstName: "Meera", lastName: "Iyer", email: "m@example.com" };

/** An unpaid period invoice of a live subscription, as the query selects it. */
function periodInvoice(over: Partial<Record<string, unknown>> = {}) {
    return {
        id: "inv_sub_1",
        status: "ISSUED",
        subscriptionId: "sub_1",
        total: "1200",
        currency: "INR",
        issuedAt: ago(9 * DAY),
        dueAt: ago(2 * DAY + 60 * 60 * 1000),
        subscription: { plan: { name: "Monthly membership" }, contact: MEERA },
        ...over,
    };
}

function moneyDb(opts: {
    unpaid?: ReturnType<typeof periodInvoice>[];
    latest?: { id: string; subscriptionId: string }[];
    overdue?: unknown[];
    overdueCount?: number;
}) {
    const unpaid = opts.unpaid ?? [];
    const latest =
        opts.latest ??
        unpaid.map((u) => ({ id: u.id, subscriptionId: u.subscriptionId }));
    const findMany = jest.fn((args: { where: Record<string, unknown> }) => {
        const where = args.where;
        if ("dueAt" in where) return Promise.resolve(opts.overdue ?? []);
        if (where.status === "ISSUED") return Promise.resolve(unpaid);
        return Promise.resolve(latest);
    });
    return {
        // D9's log: no RENEWAL_FAILED or MANDATE_LIMIT_LOW before autopay.
        subscriptionEvent: { findMany: jest.fn().mockResolvedValue([]) },
        invoice: {
            findMany,
            count: jest
                .fn()
                .mockResolvedValue(
                    opts.overdueCount ?? (opts.overdue ?? []).length,
                ),
        },
    };
}

describe("overdueTag", () => {
    it("counts whole days past due, and never says 0", () => {
        expect(overdueTag(ago(2 * DAY + 3600_000), NOW)).toBe("Overdue 2 days");
        expect(overdueTag(ago(3600_000), NOW)).toBe("Overdue 1 day");
    });
});

describe("renewalTag", () => {
    const invoice = {
        status: "ISSUED",
        issuedAt: ago(3 * DAY),
        dueAt: new Date(NOW.getTime() + 4 * DAY),
    };
    const signal = (
        kind: RenewalSignal["kind"],
        at: Date,
        subscriptionId = "sub_1",
    ): RenewalSignal => ({ subscriptionId, kind, at });

    it("is nothing to act on while an invoice is not yet due and no charge failed", () => {
        expect(renewalTag(invoice, "sub_1", [], NOW)).toBeNull();
    });

    it("says Payment failed only after a declined charge", () => {
        expect(
            renewalTag(
                invoice,
                "sub_1",
                [signal("RENEWAL_FAILED", ago(DAY))],
                NOW,
            ),
        ).toBe("Payment failed");
    });

    it("says the autopay limit is too low after MANDATE_LIMIT_LOW", () => {
        expect(
            renewalTag(
                invoice,
                "sub_1",
                [signal("MANDATE_LIMIT_LOW", ago(DAY))],
                NOW,
            ),
        ).toBe("Autopay limit too low");
    });

    it("takes the latest event, and ignores one from before this invoice or another subscription", () => {
        const signals = [
            signal("RENEWAL_FAILED", ago(10 * DAY)), // an earlier period
            signal("RENEWAL_FAILED", ago(DAY), "sub_2"),
            signal("RENEWAL_FAILED", ago(2 * DAY)),
            signal("MANDATE_LIMIT_LOW", ago(DAY)),
        ];
        expect(renewalTag(invoice, "sub_1", signals, NOW)).toBe(
            "Autopay limit too low",
        );
        expect(
            renewalTag(invoice, "sub_1", signals.slice(0, 2), NOW),
        ).toBeNull();
    });

    it("says Overdue N days on a past-due invoice with no event", () => {
        expect(
            renewalTag(
                { ...invoice, dueAt: ago(2 * DAY + 60_000) },
                "sub_1",
                [],
                NOW,
            ),
        ).toBe("Overdue 2 days");
    });
});

describe("failedRenewals", () => {
    it("gives one OVERDUE row for a period invoice two days past due", async () => {
        const db = moneyDb({ unpaid: [periodInvoice()] });
        const action = await failedRenewals(db as never, "org_1", NOW, true);

        expect(action).toEqual({
            code: "PAYMENTS_FAILED_RENEWALS",
            title: "Collect a renewal that hasn't been paid",
            href: "/billing/subscriptions/sub_1",
            severity: "OVERDUE",
            moduleKey: "PAYMENTS",
            count: 1,
            tone: "bad",
            evidence: [
                {
                    id: "sub_1",
                    title: "Monthly membership",
                    subtitle: "Meera Iyer",
                    at: periodInvoice().dueAt.toISOString(),
                    amountMinor: 120000,
                    currency: "INR",
                    href: "/billing/subscriptions/sub_1",
                    tag: "Overdue 2 days",
                    tone: "bad",
                },
            ],
        });
        // Only this business's live subscriptions' unpaid invoices.
        expect(db.invoice.findMany.mock.calls[0][0].where).toEqual({
            organizationId: "org_1",
            status: "ISSUED",
            subscriptionId: { not: null },
            subscription: { is: { status: { not: "CANCELLED" } } },
        });
    });

    it("leaves the amount out for someone who can't read invoices", async () => {
        const db = moneyDb({ unpaid: [periodInvoice()] });
        const action = await failedRenewals(db as never, "org_1", NOW, false);

        expect(action?.evidence?.[0]).toMatchObject({
            amountMinor: null,
            currency: null,
        });
    });

    it("gives one row tagged Payment failed for a declined charge on an invoice not yet due", async () => {
        const notDue = periodInvoice({
            dueAt: new Date(NOW.getTime() + 3 * DAY),
        });
        const db = moneyDb({ unpaid: [notDue] });
        const action = await failedRenewals(
            db as never,
            "org_1",
            NOW,
            true,
            () =>
                Promise.resolve([
                    {
                        subscriptionId: "sub_1",
                        kind: "RENEWAL_FAILED",
                        at: ago(DAY),
                    },
                ]),
        );

        expect(action?.count).toBe(1);
        expect(action?.evidence).toHaveLength(1);
        expect(action?.evidence?.[0].tag).toBe("Payment failed");
    });

    it("gives nothing for an invoice not yet due with no event", async () => {
        const db = moneyDb({
            unpaid: [periodInvoice({ dueAt: new Date(NOW.getTime() + DAY) })],
        });
        expect(
            await failedRenewals(db as never, "org_1", NOW, true),
        ).toBeNull();
    });

    it("reads only the latest period invoice: an older unpaid one behind a paid renewal is not a failed renewal", async () => {
        const db = moneyDb({
            unpaid: [periodInvoice()],
            latest: [{ id: "inv_sub_2_paid", subscriptionId: "sub_1" }],
        });
        expect(
            await failedRenewals(db as never, "org_1", NOW, true),
        ).toBeNull();
    });

    it("links to the Failed tab when there is more than one", async () => {
        const db = moneyDb({
            unpaid: [
                periodInvoice(),
                periodInvoice({ id: "inv_sub_2", subscriptionId: "sub_2" }),
            ],
        });
        const action = await failedRenewals(db as never, "org_1", NOW, true);

        expect(action?.title).toBe("Collect 2 renewals that haven't been paid");
        expect(action?.href).toBe("/billing/subscriptions?tab=failed");
    });
});

describe("overdueInvoices", () => {
    const HAND_WRITTEN = {
        id: "inv_1",
        number: "INV-0007",
        total: "4000",
        currency: "INR",
        dueAt: ago(2 * DAY + 60_000),
        billToName: "Café Mocha",
        contact: null,
    };

    it("gives a hand-written invoice two days past due, tagged Overdue 2 days", async () => {
        const db = moneyDb({ overdue: [HAND_WRITTEN] });
        const action = await overdueInvoices(db as never, "org_1", NOW);

        expect(action).toMatchObject({
            code: "PAYMENTS_OVERDUE_INVOICES",
            title: "Chase an overdue invoice",
            href: "/billing/invoices/inv_1",
            severity: "OVERDUE",
            count: 1,
        });
        expect(action?.evidence).toEqual([
            {
                id: "inv_1",
                title: "INV-0007",
                subtitle: "Café Mocha",
                at: HAND_WRITTEN.dueAt.toISOString(),
                amountMinor: 400000,
                currency: "INR",
                href: "/billing/invoices/inv_1",
                tag: "Overdue 2 days",
                tone: "bad",
            },
        ]);
    });

    it("asks only for issued, past-due invoices that are neither an order's nor a live subscription's", async () => {
        const db = moneyDb({ overdue: [] });
        expect(await overdueInvoices(db as never, "org_1", NOW)).toBeNull();

        expect(db.invoice.count).toHaveBeenCalledWith({
            where: {
                organizationId: "org_1",
                // An order's own paper and credit notes are never owed.
                orderId: null,
                kind: { not: "CREDIT_NOTE" },
                // A draft is never overdue.
                status: "ISSUED",
                dueAt: { lt: NOW },
                OR: [
                    { subscriptionId: null },
                    { subscription: { is: { status: "CANCELLED" } } },
                ],
            },
        });
    });

    it("keeps the true count and links to the Overdue tab when there are more", async () => {
        const db = moneyDb({ overdue: [HAND_WRITTEN], overdueCount: 7 });
        const action = await overdueInvoices(db as never, "org_1", NOW);

        expect(action?.title).toBe("Chase 7 overdue invoices");
        expect(action?.count).toBe(7);
        expect(action?.href).toBe("/billing/invoices?view=overdue");
    });
});

function shortCheck(over: Partial<StockCheck> = {}): StockCheck {
    return {
        key: "short:sl_1",
        kind: "SHORT",
        title: "2 short",
        detail: "",
        storeId: "store_1",
        storeName: "Hill Road",
        productId: "p_1",
        productName: "Linen shirt",
        variantId: "v_1",
        variantTitle: "M",
        stockLevelId: "sl_1",
        entryId: null,
        numbers: { onHand: 0, promised: 2, short: 2 },
        order: null,
        at: new Date("2026-09-20T10:00:00.000Z"),
        ...over,
    };
}

describe("stockShort", () => {
    const tracking = (on: boolean | null) => ({
        businessProfile: {
            findUnique: jest
                .fn()
                .mockResolvedValue(on === null ? null : { stockTracking: on }),
        },
    });

    it("gives one ATTENTION row for sizes short for orders", async () => {
        const checks = {
            openShort: jest
                .fn()
                .mockResolvedValue([
                    shortCheck(),
                    shortCheck({ key: "short:sl_2", variantTitle: "L" }),
                ]),
        };
        const action = await stockShort(
            tracking(true) as never,
            checks,
            "org_1",
        );

        expect(action).toMatchObject({
            code: "COMMERCE_STOCK_SHORT",
            title: "2 sizes are short for orders",
            href: "/commerce/stock?show=needs",
            severity: "ATTENTION",
            moduleKey: "COMMERCE",
            count: 2,
            tag: "Blocks orders",
            tone: "bad",
        });
        expect(action?.evidence?.[0]).toMatchObject({
            title: "Linen shirt · M",
            subtitle: "2 short at Hill Road",
        });
        expect(checks.openShort).toHaveBeenCalledWith("org_1");
    });

    it("calls a product with no sizes an item", async () => {
        const checks = {
            openShort: jest
                .fn()
                .mockResolvedValue([
                    shortCheck({ variantId: null, variantTitle: null }),
                ]),
        };
        const action = await stockShort(tracking(null) as never, checks, "o");
        expect(action?.title).toBe("1 item is short for orders");
        expect(action?.evidence?.[0].title).toBe("Linen shirt");
    });

    it("gives nothing, and reads no checks, when the business doesn't track stock", async () => {
        const checks = { openShort: jest.fn() };
        expect(
            await stockShort(tracking(false) as never, checks, "org_1"),
        ).toBeNull();
        expect(checks.openShort).not.toHaveBeenCalled();
    });
});

describe("sitesNotLive", () => {
    it("names the one site that isn't live, and links to it", async () => {
        const db = {
            site: {
                count: jest.fn().mockResolvedValue(1),
                findMany: jest.fn().mockResolvedValue([
                    {
                        id: "site_1",
                        name: "Kavi Dental",
                        createdAt: new Date("2026-09-01T00:00:00.000Z"),
                    },
                ]),
            },
        };
        const action = await sitesNotLive(db as never, "org_1");

        expect(action).toMatchObject({
            code: "WEBSITE_NOT_LIVE",
            title: "Your website isn't live yet",
            href: "/sites/site_1",
            severity: "SETUP",
            moduleKey: "WEBSITE",
            count: 1,
        });
        expect(db.site.count).toHaveBeenCalledWith({
            where: {
                organizationId: "org_1",
                deletedAt: null,
                currentPublicationId: null,
            },
        });
    });

    it("gives nothing when every site is live", async () => {
        const db = {
            site: {
                count: jest.fn().mockResolvedValue(0),
                findMany: jest.fn().mockResolvedValue([]),
            },
        };
        expect(await sitesNotLive(db as never, "org_1")).toBeNull();
    });
});

/* ------------------------------------------------------------------ */
/* Through HomeService.build: gating, degrading, ranking               */
/* ------------------------------------------------------------------ */

type View = {
    key: string;
    readiness: string;
    blockers?: { code: string; message?: string; actionHref?: string }[];
};

function home(
    views: View[],
    opts: {
        unpaid?: ReturnType<typeof periodInvoice>[];
        overdue?: unknown[];
        sites?: number;
        short?: StockCheck[] | Error;
        tracking?: boolean;
    } = {},
) {
    const availability = {
        listViews: jest
            .fn()
            .mockResolvedValue(
                views.map((v) => ({ label: v.key, blockers: [], ...v })),
            ),
    } as unknown as ModuleAvailabilityService;
    const money = moneyDb({ unpaid: opts.unpaid, overdue: opts.overdue });
    const db = {
        ...money,
        paymentIntent: {
            count: jest.fn().mockResolvedValue(0),
            findMany: jest.fn().mockResolvedValue([]),
        },
        order: {
            count: jest.fn().mockResolvedValue(0),
            findMany: jest.fn().mockResolvedValue([]),
        },
        site: {
            count: jest.fn().mockResolvedValue(opts.sites ?? 0),
            findMany: jest.fn().mockResolvedValue(
                Array.from({ length: opts.sites ?? 0 }, (_, i) => ({
                    id: `site_${i + 1}`,
                    name: "Main site",
                    createdAt: new Date("2026-09-01T00:00:00.000Z"),
                })),
            ),
        },
        businessProfile: {
            findUnique: jest
                .fn()
                .mockResolvedValue({ stockTracking: opts.tracking ?? true }),
        },
    };
    const stockChecks = {
        openShort:
            opts.short instanceof Error
                ? jest.fn().mockRejectedValue(opts.short)
                : jest.fn().mockResolvedValue(opts.short ?? []),
    };
    return {
        service: new HomeService(
            availability,
            db as never,
            stockChecks as never,
        ),
        db,
        stockChecks,
    };
}

const PAYMENTS: View = { key: "PAYMENTS", readiness: "ACTIVE" };
const COMMERCE: View = { key: "COMMERCE", readiness: "ACTIVE" };
const OWNER = { organizationId: "org_1", organizationRole: "OWNER" as const };

/** A period invoice two days past due, relative to the real clock. */
const liveOverdue = () =>
    periodInvoice({ dueAt: ago(2 * DAY + 3600_000, new Date()) });
const handOverdue = () => ({
    id: "inv_1",
    number: "INV-0007",
    total: "4000",
    currency: "INR",
    dueAt: ago(2 * DAY + 3600_000, new Date()),
    billToName: "Café Mocha",
    contact: null,
});

describe("HomeService with the F1 sources", () => {
    it("shows an owner the failed renewal and the overdue invoice, each once", async () => {
        const { service } = home([PAYMENTS], {
            unpaid: [liveOverdue()],
            overdue: [handOverdue()],
        });
        const model = await service.build(OWNER);

        const codes = model.actions.map((a) => a.code);
        expect(codes).toEqual([
            "PAYMENTS_FAILED_RENEWALS",
            "PAYMENTS_OVERDUE_INVOICES",
        ]);
        const renewal = model.actions[0];
        expect(renewal.evidence?.[0].tag).toBe("Overdue 2 days");
        expect(model.actions[1].evidence?.map((e) => e.id)).toEqual(["inv_1"]);
        expect(model.unavailable).toEqual([]);
    });

    it("gives a Member no invoice or renewal rows, and reads neither", async () => {
        const { service, db } = home([PAYMENTS], {
            unpaid: [liveOverdue()],
            overdue: [handOverdue()],
        });
        const model = await service.build({
            organizationId: "org_1",
            organizationRole: "MEMBER",
        });

        expect(model.actions).toEqual([]);
        expect(db.invoice.findMany).not.toHaveBeenCalled();
        expect(db.invoice.count).not.toHaveBeenCalled();
    });

    it("gives a role with subscription:read but not invoice:read the renewal without its amount, and no invoices", async () => {
        const { service } = home([PAYMENTS], {
            unpaid: [liveOverdue()],
            overdue: [handOverdue()],
        });
        const model = await service.build({
            ...OWNER,
            organizationActions: new Set<OrgAction>(["subscription:read"]),
        });

        expect(model.actions.map((a) => a.code)).toEqual([
            "PAYMENTS_FAILED_RENEWALS",
        ]);
        expect(model.actions[0].evidence?.[0].amountMinor).toBeNull();
    });

    it("names Stock when its checks fail, and still shows the other rows", async () => {
        const { service } = home([PAYMENTS, COMMERCE], {
            unpaid: [liveOverdue()],
            short: new Error("relation is being migrated"),
        });
        const model = await service.build(OWNER);

        expect(model.unavailable).toEqual([
            { moduleKey: "COMMERCE", label: "Stock" },
        ]);
        expect(model.actions.map((a) => a.code)).toContain(
            "PAYMENTS_FAILED_RENEWALS",
        );
    });

    it("names a failed money source without losing the other", async () => {
        const { service, db } = home([PAYMENTS], {
            overdue: [handOverdue()],
        });
        // The renewal read is the first findMany on invoices.
        db.invoice.findMany.mockRejectedValueOnce(new Error("timeout"));
        const model = await service.build(OWNER);

        expect(model.unavailable).toEqual([
            { moduleKey: "PAYMENTS", label: "Failed renewals" },
        ]);
        expect(model.actions.map((a) => a.code)).toEqual([
            "PAYMENTS_OVERDUE_INVOICES",
        ]);
    });

    it("ranks stock short (ATTENTION) above overdue money above a site to publish", async () => {
        const { service } = home(
            [
                PAYMENTS,
                COMMERCE,
                {
                    key: "WEBSITE",
                    readiness: "SETUP_REQUIRED",
                    blockers: [
                        {
                            code: "WEBSITE_NO_PUBLICATION",
                            message: "Publish your site to go live.",
                            actionHref: "/sites",
                        },
                    ],
                },
            ],
            {
                unpaid: [liveOverdue()],
                short: [shortCheck()],
                sites: 1,
            },
        );
        const model = await service.build(OWNER);

        expect(model.actions.map((a) => a.code)).toEqual([
            "COMMERCE_STOCK_SHORT",
            "PAYMENTS_FAILED_RENEWALS",
            // Replaces readiness's "Publish your site to go live": one row
            // for one fact.
            "WEBSITE_NOT_LIVE",
            "COMMERCE_SUGGEST_PRODUCT",
        ]);
    });

    it("gives no stock row and no notice when stock tracking is off", async () => {
        const { service, stockChecks } = home([COMMERCE], {
            short: [shortCheck()],
            tracking: false,
        });
        const model = await service.build(OWNER);

        expect(model.actions.map((a) => a.code)).not.toContain(
            "COMMERCE_STOCK_SHORT",
        );
        expect(model.unavailable).toEqual([]);
        expect(stockChecks.openShort).not.toHaveBeenCalled();
    });

    it("reads no stock for a role without store:read", async () => {
        const { service, stockChecks } = home([COMMERCE], {
            short: [shortCheck()],
        });
        await service.build({
            ...OWNER,
            organizationActions: new Set<OrgAction>(["order:read"]),
        });
        expect(stockChecks.openShort).not.toHaveBeenCalled();
    });

    it("tells no Reviewer the website isn't live", async () => {
        const { service, db } = home(
            [{ key: "WEBSITE", readiness: "ACTIVE" }],
            { sites: 1 },
        );
        const model = await service.build({
            organizationId: "org_1",
            organizationRole: "REVIEWER",
        });

        expect(model.actions).toEqual([]);
        expect(db.site.count).not.toHaveBeenCalled();
    });

    it("reads no F1 source for a module that is off", async () => {
        const { service, db, stockChecks } = home(
            [
                { key: "PAYMENTS", readiness: "DISABLED" },
                { key: "COMMERCE", readiness: "DISABLED" },
                { key: "WEBSITE", readiness: "DISABLED" },
            ],
            { unpaid: [liveOverdue()], short: [shortCheck()], sites: 1 },
        );
        const model = await service.build(OWNER);

        expect(model.actions).toEqual([]);
        expect(db.invoice.findMany).not.toHaveBeenCalled();
        expect(db.site.count).not.toHaveBeenCalled();
        expect(stockChecks.openShort).not.toHaveBeenCalled();
    });
});
