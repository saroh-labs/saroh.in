// The account area and the shop are switched per test (F13).
jest.mock("../../site-accounts/account-area", () => ({
    accountAreaOn: jest.fn(() => false),
}));
jest.mock("../../sites/sells-from", () => ({
    shopRolloutOn: jest.fn(() => Promise.resolve(true)),
}));
// A live site whose shop waits on "Sells from" (P4), switched per test; the
// real rows are read in sells-from-awaiting.db.spec.ts.
jest.mock("../../sites/sells-from-awaiting", () => ({
    ...jest.requireActual<typeof import("../../sites/sells-from-awaiting")>(
        "../../sites/sells-from-awaiting",
    ),
    siteAwaitingSellsFrom: jest.fn(() => Promise.resolve(null)),
}));
// Whether a connection lacks its webhook secret, without opening a sealed
// blob: a row whose blob says "no-webhook-secret" lacks it (DEC-063). The
// real check is pinned in payments/webhook-setup.spec.ts.
jest.mock("../../payments/webhook-setup", () => ({
    lacksWebhookSecret: (row: { encryptedCredentials: string }) =>
        row.encryptedCredentials === "no-webhook-secret",
}));

import { accountAreaOn } from "../../site-accounts/account-area";
import { shopRolloutOn } from "../../sites/sells-from";
import { siteAwaitingSellsFrom } from "../../sites/sells-from-awaiting";
import { ModuleReadinessRegistry } from "./module-readiness.registry";

const accountArea = accountAreaOn as jest.Mock;
const shopRollout = shopRolloutOn as jest.Mock;

/** Build a fake Prisma whose every `<model>.count` returns counts[model] ?? 0. */
function dbWith(counts: Record<string, number>) {
    const model = (name: string) => ({
        count: jest.fn().mockResolvedValue(counts[name] ?? 0),
        findMany: jest.fn().mockResolvedValue([]),
    });
    return {
        publication: model("publication"),
        site: model("site"),
        pipeline: model("pipeline"),
        service: model("service"),
        availabilityRule: model("availabilityRule"),
        // Courses asks twice: all of them, then the open ones.
        course: {
            count: jest.fn((args?: { where?: { status?: string } }) =>
                Promise.resolve(
                    args?.where?.status === "OPEN"
                        ? (counts.openCourse ?? 0)
                        : (counts.course ?? 0),
                ),
            ),
        },
        // Class packs asks three times: the published ones, the ones on
        // sale, and the drafts (E14).
        classPack: {
            count: jest.fn((args?: { where?: { status?: unknown } }) =>
                Promise.resolve(
                    args?.where?.status === "ACTIVE"
                        ? (counts.packOnSale ?? 0)
                        : args?.where?.status === "DRAFT"
                          ? (counts.packDraft ?? 0)
                          : (counts.classPack ?? 0),
                ),
            ),
        },
        store: model("store"),
        product: model("product"),
        order: model("order"),
        merchantPaymentProvider: model("merchantPaymentProvider"),
        communicationProvider: model("communicationProvider"),
        automationRule: model("automationRule"),
        analyticsEvent: model("analyticsEvent"),
        analyticsDailyAggregate: model("analyticsDailyAggregate"),
    } as never;
}

const input = { organizationId: "org_1" };

function registry(counts: Record<string, number>) {
    return new ModuleReadinessRegistry(dbWith(counts));
}

describe("ModuleReadinessRegistry", () => {
    it("Website: no site → setup; publication → active", async () => {
        expect(
            (await registry({}).evaluate("WEBSITE", input)).blockers[0].code,
        ).toBe("WEBSITE_NO_SITE");
        expect(
            (await registry({ site: 1 }).evaluate("WEBSITE", input)).blockers[0]
                .code,
        ).toBe("WEBSITE_NO_PUBLICATION");
        expect(
            (await registry({ publication: 1 }).evaluate("WEBSITE", input))
                .readiness,
        ).toBe("ACTIVE");
    });

    it("Website: live, but its shop waits on Sells from → the step to choose it (P4)", async () => {
        const waiting = siteAwaitingSellsFrom as jest.Mock;
        waiting.mockResolvedValueOnce("site_1");
        const result = await registry({ publication: 1 }).evaluate(
            "WEBSITE",
            input,
        );
        expect(result).toEqual({
            readiness: "SETUP_REQUIRED",
            blockers: [
                {
                    code: "WEBSITE_SHOP_NOT_CHOSEN",
                    message:
                        "Choose which storefront your site sells from — until then your shop page isn't live.",
                    severity: "SETUP",
                    actionHref: "/sites/site_1/settings#sells-from",
                },
            ],
        });

        // Not live yet: publishing comes first, and the shop isn't asked.
        waiting.mockClear();
        expect(
            (await registry({ site: 1 }).evaluate("WEBSITE", input)).blockers[0]
                .code,
        ).toBe("WEBSITE_NO_PUBLICATION");
        expect(waiting).not.toHaveBeenCalled();
    });

    it("CRM: pipeline required for ACTIVE", async () => {
        expect((await registry({}).evaluate("CRM", input)).readiness).toBe(
            "SETUP_REQUIRED",
        );
        expect(
            (await registry({ pipeline: 1 }).evaluate("CRM", input)).readiness,
        ).toBe("ACTIVE");
    });

    it("Courses: needs a course, then an open one", async () => {
        expect(
            (await registry({}).evaluate("COURSES", input)).blockers[0]?.code,
        ).toBe("COURSES_NO_COURSE");
        expect(
            (await registry({ course: 2 }).evaluate("COURSES", input))
                .blockers[0]?.code,
        ).toBe("COURSES_NONE_OPEN");
        expect(
            (
                await registry({ course: 2, openCourse: 1 }).evaluate(
                    "COURSES",
                    input,
                )
            ).readiness,
        ).toBe("ACTIVE");
    });

    it("Class packs: needs a pack, then one on sale", async () => {
        expect(
            (await registry({}).evaluate("CLASS_PACKS", input)).blockers[0]
                ?.code,
        ).toBe("CLASS_PACKS_NO_PACK");
        expect(
            (await registry({ classPack: 2 }).evaluate("CLASS_PACKS", input))
                .blockers[0]?.code,
        ).toBe("CLASS_PACKS_NONE_ON_SALE");
        expect(
            (
                await registry({ classPack: 2, packOnSale: 1 }).evaluate(
                    "CLASS_PACKS",
                    input,
                )
            ).readiness,
        ).toBe("ACTIVE");
    });

    it("Class packs: a draft alone isn't a pack to sell (E14)", async () => {
        const [blocker] = (
            await registry({ packDraft: 1 }).evaluate("CLASS_PACKS", input)
        ).blockers;
        expect(blocker?.code).toBe("CLASS_PACKS_NO_PACK");
        expect(blocker?.message).toBe("Publish a pack to start selling it.");
    });

    it("Class packs: turning it off is never blocked", async () => {
        await expect(
            registry({ classPack: 3 }).deactivationBlockers(
                "CLASS_PACKS",
                input,
            ),
        ).resolves.toEqual([]);
    });

    it("Appointments: needs a service then availability", async () => {
        expect(
            (await registry({}).evaluate("APPOINTMENTS", input)).blockers[0]
                .code,
        ).toBe("APPOINTMENTS_NO_SERVICE");
        expect(
            (await registry({ service: 1 }).evaluate("APPOINTMENTS", input))
                .blockers[0].code,
        ).toBe("APPOINTMENTS_NO_AVAILABILITY");
        expect(
            (
                await registry({ service: 1, availabilityRule: 1 }).evaluate(
                    "APPOINTMENTS",
                    input,
                )
            ).readiness,
        ).toBe("ACTIVE");
    });

    it("Payments: provider required", async () => {
        expect(
            (await registry({}).evaluate("PAYMENTS", input)).blockers[0].code,
        ).toBe("PAYMENTS_NO_PROVIDER");
        expect(
            (
                await registry({ merchantPaymentProvider: 1 }).evaluate(
                    "PAYMENTS",
                    input,
                )
            ).readiness,
        ).toBe("ACTIVE");
    });

    it("Commerce: open orders block a full disable", async () => {
        expect(
            await registry({}).deactivationBlockers("COMMERCE", input),
        ).toEqual([]);
        const blockers = await registry({ order: 3 }).deactivationBlockers(
            "COMMERCE",
            input,
        );
        expect(blockers[0].code).toBe("COMMERCE_OPEN_ORDERS");
    });

    it("other modules have no deactivation blockers by default", async () => {
        expect(await registry({}).deactivationBlockers("CRM", input)).toEqual(
            [],
        );
        expect(
            await registry({}).deactivationBlockers("WEBSITE", input),
        ).toEqual([]);
    });
});

/**
 * A provider-aware fake. The fake above ignores `where`, so it cannot express
 * the state that mattered here: providers exist, none of them are connected.
 */
function dbWithProviders(opts: {
    payments?: { total: number; connected: number; blobs?: string[] };
    communications?: { total: number; connected: number };
}) {
    const provider = (counts?: {
        total: number;
        connected: number;
        blobs?: string[];
    }) => ({
        count: jest.fn((args?: { where?: { status?: string } }) =>
            Promise.resolve(
                args?.where?.status === "CONNECTED"
                    ? (counts?.connected ?? 0)
                    : (counts?.total ?? 0),
            ),
        ),
        // The connected rows, each with its sealed blob (DEC-063).
        findMany: jest.fn(() =>
            Promise.resolve(
                (counts?.blobs ?? []).map((blob) => ({
                    provider: "RAZORPAY",
                    encryptedCredentials: blob,
                    credentialsIv: "iv",
                    credentialsAuthTag: "tag",
                })),
            ),
        ),
    });
    return {
        merchantPaymentProvider: provider(opts.payments),
        communicationProvider: provider(opts.communications),
    } as never;
}

describe("provider readiness reflects provider STATUS, not row count", () => {
    it.each([
        ["PAYMENTS", "payments"],
        ["COMMUNICATIONS", "communications"],
    ] as const)(
        "%s: a connected provider is ACTIVE",
        async (moduleKey, field) => {
            const result = await new ModuleReadinessRegistry(
                dbWithProviders({ [field]: { total: 2, connected: 1 } }),
            ).evaluate(moduleKey, input);

            expect(result.readiness).toBe("ACTIVE");
            expect(result.blockers).toEqual([]);
        },
    );

    it.each([
        ["PAYMENTS", "payments", "PAYMENTS_PROVIDER_DISABLED"],
        [
            "COMMUNICATIONS",
            "communications",
            "COMMUNICATIONS_PROVIDER_DISABLED",
        ],
    ] as const)(
        "%s: providers present but all disabled is ATTENTION_REQUIRED",
        async (moduleKey, field, code) => {
            // The defect: this used to read ACTIVE because a row existed, while
            // provider-health reported DEGRADED for the same row. A merchant was
            // told Payments was active while unable to take a payment.
            const result = await new ModuleReadinessRegistry(
                dbWithProviders({ [field]: { total: 1, connected: 0 } }),
            ).evaluate(moduleKey, input);

            expect(result.readiness).toBe("ATTENTION_REQUIRED");
            expect(result.blockers[0]?.code).toBe(code);
            expect(result.blockers[0]?.severity).toBe("ATTENTION");
            expect(result.blockers[0]?.actionHref).toBe("/settings/providers");
        },
    );

    it.each([
        ["PAYMENTS", "PAYMENTS_NO_PROVIDER"],
        ["COMMUNICATIONS", "COMMUNICATIONS_NO_PROVIDER"],
    ] as const)(
        "%s: no provider at all stays SETUP_REQUIRED, a different situation",
        async (moduleKey, code) => {
            // "You have not connected this yet" is not the same as "the thing
            // you connected has stopped working", and must not share copy.
            const result = await new ModuleReadinessRegistry(
                dbWithProviders({}),
            ).evaluate(moduleKey, input);

            expect(result.readiness).toBe("SETUP_REQUIRED");
            expect(result.blockers[0]?.code).toBe(code);
            expect(result.blockers[0]?.severity).toBe("SETUP");
        },
    );

    it("PAYMENTS: connected without a webhook secret can't confirm a payment (DEC-063)", async () => {
        const result = await new ModuleReadinessRegistry(
            dbWithProviders({
                payments: {
                    total: 1,
                    connected: 1,
                    blobs: ["no-webhook-secret"],
                },
            }),
        ).evaluate("PAYMENTS", input);

        expect(result.readiness).toBe("ATTENTION_REQUIRED");
        expect(result.blockers[0]?.code).toBe(
            "PAYMENTS_WEBHOOK_SECRET_MISSING",
        );
        expect(result.blockers[0]?.severity).toBe("ATTENTION");
        expect(result.blockers[0]?.actionHref).toBe("/settings/providers");
        expect(result.blockers[0]?.message).toMatch(/webhook signing secret/);
    });

    it("PAYMENTS: one connection that can confirm a payment is enough", async () => {
        const result = await new ModuleReadinessRegistry(
            dbWithProviders({
                payments: {
                    total: 2,
                    connected: 2,
                    blobs: ["no-webhook-secret", "sealed-with-secret"],
                },
            }),
        ).evaluate("PAYMENTS", input);

        expect(result.readiness).toBe("ACTIVE");
    });

    it("makes ATTENTION_REQUIRED reachable at all", async () => {
        // Before this change no adapter emitted severity ATTENTION, so the
        // state was one the types allowed, the UI rendered, and the product
        // could never produce — and no fixture could create it to review.
        const result = await new ModuleReadinessRegistry(
            dbWithProviders({ payments: { total: 3, connected: 0 } }),
        ).evaluate("PAYMENTS", input);

        expect(result.readiness).toBe("ATTENTION_REQUIRED");
    });
});

// ---------------------------------------------------------------------------
// F13: turning a module off names what it touches, with real counts.
// ---------------------------------------------------------------------------

/**
 * A fake for the impact reads. Each value is a count, or an Error to make
 * that read fail. `stores` are the open storefronts' names.
 */
function impactDb(
    opts: {
        bookings?: number | Error;
        enrolments?: number;
        purchases?: { credits: number; used: number }[] | Error;
        subscriptions?: number | Error;
        mandates?: number;
        invoices?: number | Error;
        plans?: number;
        liveSites?: number;
        sellingSites?: number;
        stores?: string[];
        products?: number;
        openOrders?: number;
        /** Each live site's published pages (G19), or a failed read. */
        livePages?: { kind?: string; title?: string }[][] | Error;
    } = {},
) {
    const give = (v: number | Error | undefined) =>
        jest.fn(() =>
            v instanceof Error ? Promise.reject(v) : Promise.resolve(v ?? 0),
        );
    const stores = opts.stores ?? [];
    return {
        booking: { count: give(opts.bookings) },
        courseEnrollment: { count: give(opts.enrolments) },
        packPurchase: {
            findMany: jest.fn(() =>
                opts.purchases instanceof Error
                    ? Promise.reject(opts.purchases)
                    : Promise.resolve(
                          (opts.purchases ?? []).map((p) => ({
                              credits: p.credits,
                              _count: { redemptions: p.used },
                          })),
                      ),
            ),
        },
        customerSubscription: { count: give(opts.subscriptions) },
        paymentMandate: { count: give(opts.mandates) },
        invoice: { count: give(opts.invoices) },
        subscriptionPlan: { count: give(opts.plans) },
        site: {
            count: jest.fn((args?: { where?: { storefrontId?: unknown } }) =>
                Promise.resolve(
                    args?.where?.storefrontId
                        ? (opts.sellingSites ?? 0)
                        : (opts.liveSites ?? 0),
                ),
            ),
            findMany: jest.fn(() =>
                opts.livePages instanceof Error
                    ? Promise.reject(opts.livePages)
                    : Promise.resolve(
                          (opts.livePages ?? []).map((pages) => ({
                              currentPublication: { snapshot: { pages } },
                          })),
                      ),
            ),
        },
        store: {
            count: jest.fn(() => Promise.resolve(stores.length)),
            findMany: jest.fn(() =>
                Promise.resolve(stores.slice(0, 2).map((name) => ({ name }))),
            ),
        },
        product: { count: give(opts.products) },
        order: { count: give(opts.openOrders) },
    } as never;
}

function impact(
    db: ReturnType<typeof impactDb>,
    key: Parameters<ModuleReadinessRegistry["deactivationImpact"]>[0],
    may?: (a: string) => boolean,
) {
    return new ModuleReadinessRegistry(db).deactivationImpact(key, {
        organizationId: "org_1",
        may,
    });
}

describe("deactivationImpact (F13)", () => {
    beforeEach(() => {
        accountArea.mockReturnValue(false);
        shopRollout.mockResolvedValue(true);
    });

    it("Appointments with 3 upcoming bookings says so, and what stops", async () => {
        const items = await impact(impactDb({ bookings: 3 }), "APPOINTMENTS");
        expect(items).toEqual([
            {
                code: "APPOINTMENTS_UPCOMING_BOOKINGS",
                moduleKey: "APPOINTMENTS",
                count: 3,
                message:
                    "3 upcoming bookings stay booked; the booking page stops taking new ones.",
            },
        ]);
    });

    it("counts only upcoming bookings that stand: confirmed, or a hold still holding", async () => {
        const db = impactDb({ bookings: 1 });
        const items = await impact(db, "APPOINTMENTS");
        expect(items[0]?.message).toBe(
            "1 upcoming booking stays booked; the booking page stops taking new ones.",
        );
        const where = (db as unknown as { booking: { count: jest.Mock } })
            .booking.count.mock.calls[0][0].where;
        expect(where.organizationId).toBe("org_1");
        expect(where.startAt.gt).toBeInstanceOf(Date);
        expect(where.OR).toEqual([
            { status: "CONFIRMED" },
            { status: "PENDING", holdExpiresAt: { gt: expect.any(Date) } },
        ]);
    });

    it("a count that fails to read says it couldn't count, never zero", async () => {
        const items = await impact(
            impactDb({ bookings: new Error("connection reset") }),
            "APPOINTMENTS",
        );
        expect(items[0]?.count).toBeNull();
        expect(items[0]?.message).toBe(
            "We couldn't count your upcoming bookings. They stay booked; the booking page stops taking new ones.",
        );
        // The database's words never reach the merchant.
        expect(items[0]?.message).not.toContain("connection");
    });

    it("one failed count doesn't take the others down", async () => {
        const items = await impact(
            impactDb({ subscriptions: 3, invoices: new Error("timeout") }),
            "PAYMENTS",
        );
        expect(items.map((i) => [i.code, i.count])).toEqual([
            ["PAYMENTS_LIVE_SUBSCRIPTIONS", 3],
            ["PAYMENTS_UNPAID_INVOICES", null],
        ]);
        expect(items[1]?.message).toBe(
            "We couldn't count your unpaid invoices. They stay open, and their pay links still work.",
        );
    });

    it("a failed pack count says so too", async () => {
        const items = await impact(
            impactDb({ purchases: new Error("timeout") }),
            "CLASS_PACKS",
        );
        expect(items[0]?.count).toBeNull();
        expect(items[0]?.message).toMatch(/^We couldn't count the packs/);
    });

    it("a viewer who can't read bookings is told what stops, without a number", async () => {
        const db = impactDb({ bookings: 3 });
        const items = await impact(db, "APPOINTMENTS", () => false);
        expect(items[0]).toEqual({
            code: "APPOINTMENTS_UPCOMING_BOOKINGS",
            moduleKey: "APPOINTMENTS",
            message:
                "Bookings already made stay booked; the booking page stops taking new ones.",
        });
        expect(
            (db as unknown as { booking: { count: jest.Mock } }).booking.count,
        ).not.toHaveBeenCalled();
    });

    it("names the account area's Bookings tab only while the account area is on", async () => {
        accountArea.mockReturnValue(true);
        const items = await impact(impactDb(), "APPOINTMENTS");
        expect(items.map((i) => i.code)).toEqual([
            "APPOINTMENTS_UPCOMING_BOOKINGS",
            "APPOINTMENTS_ACCOUNT_TAB",
        ]);
        expect(items[1]?.message).toBe(
            "Your customers' accounts on your site lose their Bookings tab.",
        );
        expect(items[1]).not.toHaveProperty("count");
    });

    it("Class packs counts packs with classes left, not used-up ones", async () => {
        const items = await impact(
            impactDb({
                purchases: [
                    { credits: 10, used: 3 },
                    { credits: 5, used: 5 },
                    { credits: 8, used: 0 },
                ],
            }),
            "CLASS_PACKS",
        );
        expect(items[0]?.count).toBe(2);
        expect(items[0]?.message).toBe(
            "2 packs with classes left keep them, and your team can still use them at the desk. New packs stop selling, and customers can't use theirs online.",
        );
    });

    it("Class packs with none left says only what stops", async () => {
        const items = await impact(impactDb(), "CLASS_PACKS");
        expect(items[0]?.message).toBe(
            "Packs stop selling, online and at the desk.",
        );
    });

    it("Courses counts enrolments, and says nothing when there are none", async () => {
        expect(
            (await impact(impactDb({ enrolments: 4 }), "COURSES"))[0]?.message,
        ).toBe("4 enrolments keep their seat and booked sessions.");
        expect(await impact(impactDb(), "COURSES")).toEqual([]);
    });

    it("Payments: live subscriptions, autopay, unpaid invoices and the site's plans", async () => {
        const items = await impact(
            impactDb({
                subscriptions: 3,
                mandates: 2,
                invoices: 1,
                liveSites: 1,
                plans: 2,
            }),
            "PAYMENTS",
        );
        expect(items.map((i) => [i.code, i.count, i.message])).toEqual([
            [
                "PAYMENTS_LIVE_SUBSCRIPTIONS",
                3,
                "3 live subscriptions stop renewing until it's back on. Nobody is charged in between.",
            ],
            [
                "PAYMENTS_AUTOPAY",
                2,
                "Autopay stays set up on 2 subscriptions, and takes nothing until it's back on.",
            ],
            [
                "PAYMENTS_UNPAID_INVOICES",
                1,
                "1 unpaid invoice stays open, and its pay link still works.",
            ],
            [
                "PAYMENTS_SITE_PLANS",
                2,
                "Your site stops showing your 2 plans, and nobody new can subscribe.",
            ],
        ]);
    });

    it("Payments with nothing live says nothing it can't back up", async () => {
        expect(await impact(impactDb(), "PAYMENTS")).toEqual([]);
    });

    it("Payments: no live site means no plans line", async () => {
        const items = await impact(
            impactDb({ liveSites: 0, plans: 4 }),
            "PAYMENTS",
        );
        expect(items.map((i) => i.code)).not.toContain("PAYMENTS_SITE_PLANS");
    });

    it("Payments: each count asks its own read (invoices need invoice:read)", async () => {
        const items = await impact(
            impactDb({ subscriptions: 3, invoices: 4 }),
            "PAYMENTS",
            (a) => a === "subscription:read",
        );
        expect(items.map((i) => i.code)).toEqual([
            "PAYMENTS_LIVE_SUBSCRIPTIONS",
        ]);
    });

    it("Commerce names one or two storefronts, and counts products and the site's shop", async () => {
        const items = await impact(
            impactDb({ stores: ["Hill Road"], products: 24, sellingSites: 1 }),
            "COMMERCE",
        );
        expect(items.map((i) => i.message)).toEqual([
            "Hill Road stops taking orders.",
            "24 published products stop selling.",
            "Your site's shop, product pages and Product grid stop showing.",
        ]);
        const two = await impact(
            impactDb({ stores: ["Hill Road", "Online"] }),
            "COMMERCE",
        );
        expect(two[0]?.message).toBe(
            "Hill Road and Online stop taking orders.",
        );
        const many = await impact(
            impactDb({ stores: ["A", "B", "C"] }),
            "COMMERCE",
        );
        expect(many[0]?.message).toBe("Your 3 storefronts stop taking orders.");
    });

    it("Commerce says nothing about a shop while the shop isn't rolled out", async () => {
        shopRollout.mockResolvedValue(false);
        const items = await impact(impactDb({ sellingSites: 2 }), "COMMERCE");
        expect(items.map((i) => i.code)).not.toContain("COMMERCE_SITE_SHOP");
    });

    it("Commerce: the website stops showing its Shop page, by its menu name (G19)", async () => {
        const db = impactDb({
            livePages: [
                [
                    { title: "Home" },
                    { kind: "SHOP", title: "Shop" },
                    { kind: "BOOK", title: "Book" },
                ],
            ],
        });
        const items = await impact(db, "COMMERCE");
        expect(items).toContainEqual({
            code: "COMMERCE_SITE_SHOP_PAGE",
            moduleKey: "COMMERCE",
            count: 1,
            message: "Your website stops showing Shop.",
        });
        // Only live sites are read, and only this business's.
        const where = (db as unknown as { site: { findMany: jest.Mock } }).site
            .findMany.mock.calls[0][0].where;
        expect(where).toEqual({
            organizationId: "org_1",
            deletedAt: null,
            currentPublicationId: { not: null },
        });
    });

    it("Commerce names the Shop page as the merchant titled it", async () => {
        const items = await impact(
            impactDb({ livePages: [[{ kind: "SHOP", title: "Bakes" }]] }),
            "COMMERCE",
        );
        expect(
            items.find((i) => i.code === "COMMERCE_SITE_SHOP_PAGE")?.message,
        ).toBe("Your website stops showing Bakes.");
    });

    it("Commerce says nothing of a Shop page the website hasn't published", async () => {
        const items = await impact(
            impactDb({ livePages: [[{ title: "Home" }, { title: "About" }]] }),
            "COMMERCE",
        );
        expect(items.map((i) => i.code)).not.toContain(
            "COMMERCE_SITE_SHOP_PAGE",
        );
    });

    it("Commerce says nothing of a Shop page while the shop isn't rolled out (DEC-057)", async () => {
        shopRollout.mockResolvedValue(false);
        const items = await impact(
            impactDb({ livePages: [[{ kind: "SHOP", title: "Shop" }]] }),
            "COMMERCE",
        );
        expect(items.map((i) => i.code)).not.toContain(
            "COMMERCE_SITE_SHOP_PAGE",
        );
    });

    it("Appointments: the website stops showing its Book page (G19)", async () => {
        const items = await impact(
            impactDb({
                bookings: 2,
                livePages: [[{ kind: "BOOK", title: "Classes" }]],
            }),
            "APPOINTMENTS",
        );
        expect(items.map((i) => [i.code, i.message])).toEqual([
            [
                "APPOINTMENTS_UPCOMING_BOOKINGS",
                "2 upcoming bookings stay booked; the booking page stops taking new ones.",
            ],
            [
                "APPOINTMENTS_SITE_BOOK_PAGE",
                "Your website stops showing Classes.",
            ],
        ]);
    });

    it("a website that can't be read says so, and a viewer who can't read sites is told nothing about it", async () => {
        const failed = await impact(
            impactDb({ livePages: new Error("timeout") }),
            "APPOINTMENTS",
        );
        expect(
            failed.find((i) => i.code === "APPOINTMENTS_SITE_BOOK_PAGE"),
        ).toEqual({
            code: "APPOINTMENTS_SITE_BOOK_PAGE",
            moduleKey: "APPOINTMENTS",
            count: null,
            message:
                "We couldn't check your website. If it has a Book page, it stops showing.",
        });

        const hidden = await impact(
            impactDb({ livePages: [[{ kind: "BOOK", title: "Book" }]] }),
            "APPOINTMENTS",
            (a) => a === "booking:read",
        );
        expect(hidden.map((i) => i.code)).not.toContain(
            "APPOINTMENTS_SITE_BOOK_PAGE",
        );
    });

    it("Website: a live site stays up as last published", async () => {
        const items = await impact(impactDb({ liveSites: 1 }), "WEBSITE");
        expect(items[0]?.message).toBe(
            "Your live site stays up as last published; changes wait until it's back on.",
        );
    });

    it("a module with nothing to count says nothing", async () => {
        for (const key of [
            "CRM",
            "COMMUNICATIONS",
            "AUTOMATIONS",
            "INSIGHTS",
        ] as const) {
            expect(await impact(impactDb(), key)).toEqual([]);
        }
    });

    it("the Commerce blocker gives its number only to someone who may read orders", async () => {
        const reg = new ModuleReadinessRegistry(impactDb({ openOrders: 2 }));
        const [counted] = await reg.deactivationBlockers("COMMERCE", {
            organizationId: "org_1",
            may: (a) => a === "order:stage",
        });
        expect(counted?.message).toBe(
            "2 open orders need sending or cancelling first. Orders already placed stay in Orders.",
        );
        expect(counted?.actionHref).toBe("/commerce/orders");
        const [blind] = await reg.deactivationBlockers("COMMERCE", {
            organizationId: "org_1",
            may: () => false,
        });
        expect(blind?.code).toBe("COMMERCE_OPEN_ORDERS");
        expect(blind?.message).not.toMatch(/\d/);
    });
});
