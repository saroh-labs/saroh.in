/**
 * Admin › Billing over HTTP against a real Postgres (DEC-163): only Saroh
 * staff holding `saroh-billing:read` (Platform Owners and Billing) see every
 * business's invoices, their PDFs, the month's export and the
 * subscriptions. The owner's rule (17 Oct): the API decides, and nobody
 * else gets in.
 *
 * - No session: 401 on every route.
 * - A business owner (signed in, not staff): 403.
 * - Staff without the permission (Support, even with an open support-access
 *   session for that business; the read-only Auditor): 403.
 * - Billing: 200, with rows from more than one business; each read on the
 *   admin ledger.
 * - The business's own list (`SarohInvoicesService.list`) still returns
 *   only its own invoices.
 *
 * The real staff guards run (`PlatformAdminGuard` reads the grants from the
 * database, `PlatformPermissionGuard` the route's permission). Only Better
 * Auth is a stand-in, because Jest cannot load it: it reads the user id from
 * a test header and refuses without one, as the real guard refuses without a
 * session. Amounts are made up. Integration project (TEST_DATABASE_URL).
 */
jest.mock("../../common/guards/better-auth.guard", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { UnauthorizedException } = require("@nestjs/common") as {
        UnauthorizedException: new (message: string) => Error;
    };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { prisma } = require("@saroh/database") as {
        prisma: {
            user: {
                findUnique: (args: unknown) => Promise<{ id: string } | null>;
            };
        };
    };
    return {
        BetterAuthGuard: class BetterAuthGuard {
            async canActivate(context: {
                switchToHttp: () => {
                    getRequest: () => {
                        headers: Record<string, string | undefined>;
                        user?: unknown;
                    };
                };
            }) {
                const request = context.switchToHttp().getRequest();
                const id = request.headers["x-test-user"];
                const user = id
                    ? await prisma.user.findUnique({ where: { id } })
                    : null;
                if (!user) {
                    throw new UnauthorizedException(
                        "Invalid or expired session",
                    );
                }
                request.user = user;
                return true;
            }
        },
    };
});

import type { INestApplication } from "@nestjs/common";
import { ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { prisma } from "@saroh/database";

import { AllExceptionsFilter } from "../../common/filters/all-exceptions.filter";
import { PlatformAdminGuard } from "../../common/guards/platform-admin.guard";
import { PlatformPermissionGuard } from "../../common/guards/platform-permission.guard";
import { IdempotencyService } from "../../common/idempotency/idempotency.service";
import { validationPipeOptions } from "../../common/validation";
import { CheckoutService } from "../billing/checkout.service";
import { SarohInvoicesService } from "../billing/saroh-invoices.service";
import { AdminAccessService } from "./admin-access.service";
import { AdminAuditService } from "./admin-audit.service";
import { AdminBillingActionsService } from "./admin-billing-actions.service";
import { AdminBillingControlsController } from "./admin-billing-controls.controller";
import { AdminBillingControlsService } from "./admin-billing-controls.service";
import { AdminBillingController } from "./admin-billing.controller";
import { AdminBillingService } from "./admin-billing.service";
import {
    ACCESS_SESSION_HEADER,
    OrganizationAccessSessionGuard,
} from "./organization-access-session.guard";

const tag = `${process.pid}-${Date.now()}`;
const DAY = 24 * 60 * 60 * 1000;

let app: INestApplication;
let url: string;

const people = { owner: "", support: "", auditor: "", billing: "" };
const orgs = { a: "", b: "" };
const invoices = { a: "", b: "" };
let subscriptionA = "";
let supportSession = "";

async function user(name: string): Promise<string> {
    return (
        await prisma.user.create({
            data: { email: `${name}-${tag}@example.com`, name },
        })
    ).id;
}

async function staff(userId: string, role: string): Promise<string> {
    const admin = await prisma.platformAdmin.create({
        data: {
            userId,
            roleAssignments: { create: { role, reason: "admin billing spec" } },
        },
    });
    return admin.id;
}

/** A Saroh invoice with one line; made-up amounts that satisfy the CHECKs. */
async function invoice(
    organizationId: string,
    n: number,
    gstin: string | null,
) {
    const taxable = 10_000 * n;
    const half = 900 * n;
    const row = await prisma.sarohInvoice.create({
        data: {
            organizationId,
            number: `TST/${tag.slice(-6)}/${n}`,
            series: `TST/${tag}`,
            chargeKey: `spec:${tag}:${n}`,
            source: "NEW",
            provider: "RAZORPAY",
            providerEventId: `evt_${tag}_${n}`,
            providerPaymentId: `pay_${tag}_${n}`,
            planName: "Plan B",
            cycle: "month",
            issuedAt: new Date(Date.UTC(2026, 9, 10 + n, 6)),
            sellerName: "Example Labs",
            billToName: `Buyer ${n}`,
            billToGstin: gstin,
            placeOfSupply: "29",
            taxType: "INTRA",
            subtotalPaise: taxable,
            taxablePaise: taxable,
            cgstPaise: half,
            sgstPaise: half,
            igstPaise: 0,
            taxPaise: 2 * half,
            totalPaise: taxable + 2 * half,
        },
    });
    await prisma.sarohInvoiceLine.create({
        data: {
            invoiceId: row.id,
            organizationId,
            position: 1,
            description: "Plan B — Monthly",
            sac: "999999",
            unitPaise: taxable,
            taxablePaise: taxable,
            gstRateBps: 1800,
            cgstPaise: half,
            sgstPaise: half,
            igstPaise: 0,
            taxPaise: 2 * half,
            amountPaise: taxable + 2 * half,
        },
    });
    return row.id;
}

beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
        controllers: [AdminBillingController, AdminBillingControlsController],
        providers: [
            AdminBillingService,
            AdminBillingActionsService,
            AdminBillingControlsService,
            IdempotencyService,
            // The queue's reads never reach the checkout.
            { provide: CheckoutService, useValue: {} },
            AdminAuditService,
            AdminAccessService,
            PlatformAdminGuard,
            PlatformPermissionGuard,
            OrganizationAccessSessionGuard,
        ],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.useGlobalPipes(new ValidationPipe(validationPipeOptions));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.listen(0, "127.0.0.1");
    url = await app.getUrl();

    orgs.a = (
        await prisma.organization.create({
            data: { name: "Billing A", slug: `billing-a-${tag}` },
        })
    ).id;
    orgs.b = (
        await prisma.organization.create({
            data: { name: "Billing B", slug: `billing-b-${tag}` },
        })
    ).id;

    people.owner = await user("owner");
    await prisma.membership.create({
        data: { organizationId: orgs.a, userId: people.owner, role: "OWNER" },
    });
    people.support = await user("support");
    const supportAdmin = await staff(people.support, "SUPPORT");
    people.auditor = await user("auditor");
    await staff(people.auditor, "AUDITOR");
    people.billing = await user("billing");
    await staff(people.billing, "BILLING");

    // Support with an open support-access session for business A.
    supportSession = (
        await prisma.adminAccessSession.create({
            data: {
                organizationId: orgs.a,
                platformAdminId: supportAdmin,
                actorUserId: people.support,
                reason: "helping business A",
                idempotencyKey: `session-${tag}`,
                expiresAt: new Date(Date.now() + DAY),
            },
        })
    ).id;

    invoices.a = await invoice(orgs.a, 1, null);
    invoices.b = await invoice(orgs.b, 2, "29AAAAA0000A1Z5");

    const plan = await prisma.plan.create({
        data: {
            key: `spec.${tag}`,
            version: 1,
            name: "Plan B",
            priceCents: 22_200,
            interval: "month",
            entitlements: {},
        },
    });
    subscriptionA = (
        await prisma.subscription.create({
            data: { organizationId: orgs.a, planId: plan.id, status: "ACTIVE" },
        })
    ).id;
    await prisma.subscription.create({
        data: { organizationId: orgs.b, planId: plan.id, status: "PAST_DUE" },
    });
    await prisma.billingWebhookEvent.create({
        data: {
            provider: "RAZORPAY",
            providerEventId: `evt_cancel_${tag}`,
            type: "subscription.cancelled",
            organizationId: orgs.a,
            payload: { secret: "never-returned" },
        },
    });
});

afterAll(async () => {
    // No clean-up of rows here: the integration setup truncates every table
    // after the file, and its afterAll runs first and ends the pool.
    await app?.close();
});

function get(path: string, as?: string, headers: Record<string, string> = {}) {
    return fetch(`${url}/admin${path}`, {
        headers: { ...(as ? { "x-test-user": as } : {}), ...headers },
    });
}

const ROUTES = () => [
    "/billing/invoices",
    "/billing/invoices/export?month=2026-10",
    `/billing/invoices/${invoices.a}/pdf`,
    "/billing/subscriptions",
    `/billing/subscriptions/${subscriptionA}`,
];

describe("Admin › Billing: who may read it", () => {
    it("401 with no session, on every route", async () => {
        for (const path of ROUTES()) {
            expect((await get(path)).status).toBe(401);
        }
    });

    it("403 for a business owner who is not staff, on every route, their own invoice's PDF too", async () => {
        for (const path of ROUTES()) {
            expect((await get(path, people.owner)).status).toBe(403);
        }
    });

    it("403 for Support, even with an open support-access session for that business", async () => {
        for (const path of ROUTES()) {
            const res = await get(path, people.support, {
                [ACCESS_SESSION_HEADER]: supportSession,
            });
            expect(res.status).toBe(403);
        }
    });

    it("403 for the read-only Auditor", async () => {
        for (const path of ROUTES()) {
            expect((await get(path, people.auditor)).status).toBe(403);
        }
    });

    it("200 for Billing: invoices from more than one business, with totals", async () => {
        const res = await get(
            "/billing/invoices?month=2026-10",
            people.billing,
        );
        expect(res.status).toBe(200);
        const body = (await res.json()) as {
            items: { id: string; organization: { id: string } }[];
            totals: { count: number };
        };
        const mine = body.items.filter((i) =>
            [invoices.a, invoices.b].includes(i.id),
        );
        expect(new Set(mine.map((i) => i.organization.id))).toEqual(
            new Set([orgs.a, orgs.b]),
        );
        expect(body.totals.count).toBeGreaterThanOrEqual(2);
    });

    it("200 for Billing: the GSTIN filter keeps only invoices with one", async () => {
        const res = await get("/billing/invoices?gstin=yes", people.billing);
        const body = (await res.json()) as { items: { id: string }[] };
        const ids = body.items.map((i) => i.id);
        expect(ids).toContain(invoices.b);
        expect(ids).not.toContain(invoices.a);
    });

    it("200 for Billing: the month's CSV holds both businesses' invoices", async () => {
        const res = await get(
            "/billing/invoices/export?month=2026-10",
            people.billing,
        );
        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toContain("text/csv");
        expect(res.headers.get("content-disposition")).toContain(
            "saroh-invoices-2026-10.csv",
        );
        const csv = await res.text();
        expect(csv).toContain("Buyer 1");
        expect(csv).toContain(
            "Buyer 2,29AAAAA0000A1Z5,Karnataka,29,B2B,999999",
        );
    });

    it("400 for an export without a month", async () => {
        expect(
            (await get("/billing/invoices/export", people.billing)).status,
        ).toBe(400);
    });

    it("200 for Billing: any business's invoice PDF; 404 for one that doesn't exist", async () => {
        for (const id of [invoices.a, invoices.b]) {
            const res = await get(
                `/billing/invoices/${id}/pdf`,
                people.billing,
            );
            expect(res.status).toBe(200);
            expect(res.headers.get("content-type")).toContain(
                "application/pdf",
            );
            expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(100);
        }
        expect(
            (await get("/billing/invoices/nope/pdf", people.billing)).status,
        ).toBe(404);
    });

    it("200 for Billing: subscriptions across businesses, and one's events without their payload", async () => {
        const list = await get("/billing/subscriptions", people.billing);
        expect(list.status).toBe(200);
        const page = (await list.json()) as {
            items: { organization: { id: string } }[];
            summary: { mrrPaise: number };
        };
        const ids = new Set(page.items.map((s) => s.organization.id));
        expect(ids.has(orgs.a) && ids.has(orgs.b)).toBe(true);
        expect(page.summary.mrrPaise).toBeGreaterThanOrEqual(2 * 22_200);

        const pastDue = await get(
            "/billing/subscriptions?view=past-due",
            people.billing,
        );
        const due = (await pastDue.json()) as {
            items: { organization: { id: string } }[];
        };
        expect(due.items.map((s) => s.organization.id)).toContain(orgs.b);
        expect(due.items.map((s) => s.organization.id)).not.toContain(orgs.a);

        const detail = await get(
            `/billing/subscriptions/${subscriptionA}`,
            people.billing,
        );
        expect(detail.status).toBe(200);
        const text = await detail.text();
        expect(text).toContain("subscription.cancelled");
        expect(text).not.toContain("never-returned");
    });

    it("records each Billing read on the admin ledger", async () => {
        const actions = (
            await prisma.adminAuditEvent.findMany({
                where: { actorUserId: people.billing },
                select: { action: true, permission: true },
            })
        ).map((e) => e.action);
        for (const action of [
            "billing.invoices.list",
            "billing.invoices.export",
            "billing.invoice.pdf",
            "billing.subscriptions.list",
            "billing.subscription.read",
        ]) {
            expect(actions).toContain(action);
        }
    });
});

/** A row of the subscriptions list, as much as these tests read. */
interface SubRow {
    id: string;
    organization: { id: string };
    status: string;
    nextChargeAt: string | null;
    nextChargeHow: string;
    autopayRunsOutSoon: boolean;
    termEndsAt: string | null;
    termPayment: string | null;
    billingProfile: { name: string; businesses: number } | null;
}

describe("Admin › Billing: one page (R25, R26)", () => {
    // Provider ids take letters and digits only.
    const idTag = tag.replace(/\D/g, "");
    const ids = {
        sub: `sub_${idTag}A`,
        cust: `cust_${idTag}P`,
        pay: `pay_${idTag}C`,
        order: `order_${idTag}Y`,
    };
    const one = { autopay: "", yearly: "", trial: "", ended: "", ending: "" };
    const now = Date.now();
    const periodEnd = new Date(now + 20 * DAY);
    const yearEnd = new Date(now + 200 * DAY);

    async function org(name: string): Promise<string> {
        return (
            await prisma.organization.create({
                data: { name, slug: `${name.toLowerCase()}-${tag}` },
            })
        ).id;
    }

    beforeAll(async () => {
        const monthly = await prisma.plan.create({
            data: {
                key: `spec.${tag}.m`,
                version: 1,
                name: "Plan M",
                priceCents: 11_100,
                interval: "month",
                entitlements: {},
            },
        });
        const yearly = await prisma.plan.create({
            data: {
                key: `spec.${tag}.y`,
                version: 1,
                name: "Plan Y",
                priceCents: 99_900,
                interval: "year",
                entitlements: {},
            },
        });
        one.autopay = await org("Autopay");
        one.yearly = await org("Yearly");
        one.trial = await org("Trial");
        one.ended = await org("Ended");
        one.ending = await org("Ending");

        // One owner's profile billing two businesses (DEC-167).
        const profile = await prisma.billingProfile.create({
            data: {
                ownerUserId: people.owner,
                legalName: "Example Holdings",
                billingEmail: `holdings-${tag}@example.com`,
                provider: "RAZORPAY",
                providerCustomerId: ids.cust,
            },
        });
        await prisma.organization.updateMany({
            where: { id: { in: [one.autopay, one.trial] } },
            data: { billingProfileId: profile.id },
        });

        // Monthly autopay: approved for twelve charges 340 days ago, so it
        // runs out in about 25 days, after this period's charge.
        await prisma.subscription.create({
            data: {
                organizationId: one.autopay,
                planId: monthly.id,
                status: "ACTIVE",
                provider: "RAZORPAY",
                providerSubscriptionId: ids.sub,
                providerCustomerId: ids.cust,
                currentPeriodEnd: periodEnd,
            },
        });
        await prisma.billingCheckout.create({
            data: {
                organizationId: one.autopay,
                planId: monthly.id,
                cycle: "month",
                kind: "NEW",
                status: "COMPLETED",
                provider: "RAZORPAY",
                providerSubscriptionId: ids.sub,
                providerPlanId: `plan_${idTag}`,
                pricePaise: 11_100,
                expiresAt: new Date(now - 335 * DAY),
                completedAt: new Date(now - 340 * DAY),
            },
        });
        await prisma.sarohInvoice.create({
            data: {
                organizationId: one.autopay,
                number: `TST/${tag.slice(-6)}/9`,
                series: `TST/${tag}`,
                chargeKey: `spec:${tag}:9`,
                source: "RENEWAL",
                provider: "RAZORPAY",
                providerEventId: `evt_${tag}_9`,
                providerPaymentId: ids.pay,
                planName: "Plan M",
                cycle: "month",
                issuedAt: new Date(now - 10 * DAY),
                sellerName: "Example Labs",
                billToName: "Example Holdings",
                placeOfSupply: "29",
                taxType: "INTRA",
                subtotalPaise: 10_000,
                taxablePaise: 10_000,
                cgstPaise: 900,
                sgstPaise: 900,
                igstPaise: 0,
                taxPaise: 1_800,
                totalPaise: 11_800,
            },
        });

        // A year paid at once (DEC-093): an order, no autopay.
        await prisma.subscription.create({
            data: {
                organizationId: one.yearly,
                planId: yearly.id,
                status: "ACTIVE",
                billingCycle: "year",
                provider: "RAZORPAY",
                providerSubscriptionId: ids.order,
                currentPeriodEnd: yearEnd,
            },
        });
        await prisma.billingCheckout.create({
            data: {
                organizationId: one.yearly,
                planId: yearly.id,
                cycle: "year",
                kind: "NEW",
                status: "COMPLETED",
                provider: "RAZORPAY",
                providerSubscriptionId: ids.order,
                providerPlanId: "one-time",
                pricePaise: 99_900,
                expiresAt: new Date(now - 160 * DAY),
                completedAt: new Date(now - 165 * DAY),
            },
        });

        await prisma.subscription.create({
            data: {
                organizationId: one.trial,
                planId: monthly.id,
                status: "TRIALING",
                currentPeriodEnd: periodEnd,
            },
        });
        await prisma.subscription.create({
            data: {
                organizationId: one.ended,
                planId: monthly.id,
                status: "CANCELLED",
            },
        });
        await prisma.subscription.create({
            data: {
                organizationId: one.ending,
                planId: monthly.id,
                status: "ACTIVE",
                cancelAtPeriodEnd: true,
                currentPeriodEnd: new Date(now + 5 * DAY),
            },
        });
        await prisma.billingAction.create({
            data: {
                organizationId: one.autopay,
                code: "refund_owed",
                refs: { payment: ids.pay },
                note: "A spec's open row",
            },
        });
        await prisma.billingWebhookEvent.create({
            data: {
                provider: "RAZORPAY",
                providerEventId: `evt_autopay_${tag}`,
                type: "subscription.charged",
                organizationId: one.autopay,
                payload: {},
            },
        });
    });

    async function list(query: string): Promise<{
        items: SubRow[];
        summary: { endingSoon: number };
    }> {
        const res = await get(`/billing/subscriptions${query}`, people.billing);
        expect(res.status).toBe(200);
        return (await res.json()) as {
            items: SubRow[];
            summary: { endingSoon: number };
        };
    }

    const orgsOf = (rows: { organization: { id: string } }[]) =>
        rows.map((r) => r.organization.id);

    it("an autopay row: its next charge, how, and that it runs out soon", async () => {
        const { items } = await list(`?q=${ids.sub}`);
        const row = items.find((r) => r.organization.id === one.autopay);
        expect(row).toMatchObject({
            nextChargeHow: "AUTOPAY",
            nextChargeAt: periodEnd.toISOString(),
            termPayment: "AUTOPAY",
            autopayRunsOutSoon: true,
        });
    });

    it("a year paid at once: paid for the year, ending when the year does", async () => {
        const { items } = await list(`?q=yearly-${tag}`);
        const row = items.find((r) => r.organization.id === one.yearly);
        expect(row).toMatchObject({
            nextChargeHow: "PAID_FOR_YEAR",
            nextChargeAt: null,
            termPayment: "ONE_TIME",
            termEndsAt: yearEnd.toISOString(),
            autopayRunsOutSoon: false,
        });
    });

    it("two businesses on one profile: each row says so", async () => {
        const { items } = await list(`?q=${ids.cust}`);
        expect(new Set(orgsOf(items))).toEqual(
            new Set([one.autopay, one.trial]),
        );
        for (const row of items) {
            expect(row.billingProfile).toEqual({
                name: "Example Holdings",
                businesses: 2,
            });
        }
        const { items: plain } = await list(`?q=ended-${tag}`);
        expect(plain[0]?.billingProfile).toBeNull();
    });

    it("filters by status and by the ending-soon view", async () => {
        const trial = orgsOf((await list("?status=TRIALING")).items);
        expect(trial).toContain(one.trial);
        expect(trial).not.toContain(one.autopay);

        const ended = orgsOf((await list("?status=CANCELLED")).items);
        expect(ended).toContain(one.ended);
        expect(ended).not.toContain(one.ending);

        const ending = await list("?view=ending-soon");
        expect(orgsOf(ending.items)).toContain(one.ending);
        expect(orgsOf(ending.items)).not.toContain(one.ended);
        expect(ending.summary.endingSoon).toBeGreaterThanOrEqual(1);

        // A plan and a search narrow together.
        const both = orgsOf(
            (await list(`?plan=spec.${tag}.m&q=trial-${tag}`)).items,
        );
        expect(both).toEqual([one.trial]);
    });

    it("finds the business by its pay_, sub_ and cust_ ids", async () => {
        expect(orgsOf((await list(`?q=${ids.pay}`)).items)).toEqual([
            one.autopay,
        ]);
        expect(orgsOf((await list(`?q=${ids.sub}`)).items)).toEqual([
            one.autopay,
        ]);
        expect(orgsOf((await list(`?q=${ids.cust}`)).items)).toContain(
            one.autopay,
        );
    });

    it("the one search narrows Needs action and provider events too", async () => {
        const actions = await get(
            `/billing/actions?q=${ids.pay}`,
            people.billing,
        );
        expect(actions.status).toBe(200);
        const a = (await actions.json()) as {
            items: { organization: { id: string } | null }[];
        };
        expect(a.items.map((r) => r.organization?.id)).toEqual([one.autopay]);

        const events = await get(
            `/billing/events?q=autopay-${tag}`,
            people.billing,
        );
        const e = (await events.json()) as { items: { type: string }[] };
        expect(e.items.map((r) => r.type)).toEqual(["subscription.charged"]);
    });

    it("counts each tab, for Billing only", async () => {
        const res = await get("/billing/counts", people.billing);
        expect(res.status).toBe(200);
        const counts = (await res.json()) as Record<string, number>;
        expect(counts.subscriptions).toBeGreaterThanOrEqual(7);
        expect(counts.invoices).toBeGreaterThanOrEqual(3);
        expect(counts.openActions).toBeGreaterThanOrEqual(1);
        expect(counts.events).toBeGreaterThanOrEqual(2);
        expect((await get("/billing/counts", people.support)).status).toBe(403);
        expect((await get("/billing/counts")).status).toBe(401);
    });
});

describe("Admin › Billing › Invoices: Paid, Unpaid, Refunded (R29)", () => {
    const st = { org: "", refunded: "", short: "", lost: "", pending: "" };
    const slug = `billing-c-${tag}`;

    beforeAll(async () => {
        st.org = (
            await prisma.organization.create({
                data: { name: "Billing C", slug },
            })
        ).id;
        st.refunded = await invoice(st.org, 11, null);
        st.short = await invoice(st.org, 12, null);
        st.lost = await invoice(st.org, 13, null);
        st.pending = await invoice(st.org, 14, null);
        // Razorpay took less than invoice 12's total.
        await prisma.sarohInvoice.update({
            where: { id: st.short },
            data: { providerAmountPaise: 100 },
        });
        const refund = (
            invoiceId: string,
            kind: string,
            status: string,
            n: number,
        ) =>
            prisma.billingRefund.create({
                data: {
                    organizationId: st.org,
                    provider: "RAZORPAY",
                    kind,
                    providerRefundId: `rfnd_${tag}_${n}`,
                    providerPaymentId: `pay_${tag}_${n}`,
                    invoiceId,
                    amountPaise: 500,
                    status,
                    source: "PROVIDER",
                },
            });
        await refund(st.refunded, "REFUND", "PROCESSED", 11);
        await refund(st.lost, "DISPUTE", "LOST", 13);
        // A refund still pending gives nothing back yet.
        await refund(st.pending, "REFUND", "PENDING", 14);
    });

    async function ids(query: string): Promise<{
        ids: string[];
        statusCounts: Record<string, number>;
    }> {
        const res = await get(`/billing/invoices${query}`, people.billing);
        expect(res.status).toBe(200);
        const body = (await res.json()) as {
            items: { id: string }[];
            statusCounts: Record<string, number>;
        };
        return {
            ids: body.items.map((i) => i.id),
            statusCounts: body.statusCounts,
        };
    }

    it("Unpaid is an invoice Razorpay took less for, and nothing else", async () => {
        const { ids: unpaid } = await ids("?status=unpaid");
        expect(unpaid).toContain(st.short);
        for (const other of [st.refunded, st.lost, st.pending, invoices.a]) {
            expect(unpaid).not.toContain(other);
        }
    });

    it("Refunded is a processed refund or a lost dispute, never a pending refund", async () => {
        const { ids: refunded } = await ids("?status=refunded");
        expect(refunded).toEqual(
            expect.arrayContaining([st.refunded, st.lost]),
        );
        expect(refunded).not.toContain(st.pending);
        expect(refunded).not.toContain(st.short);
    });

    it("Paid is the rest", async () => {
        const { ids: paid } = await ids("?status=paid");
        expect(paid).toEqual(
            expect.arrayContaining([invoices.a, invoices.b, st.pending]),
        );
        for (const other of [st.refunded, st.lost, st.short]) {
            expect(paid).not.toContain(other);
        }
    });

    it("counts each status under the other filters, whatever status is picked", async () => {
        const all = await ids(`?q=${slug}`);
        const picked = await ids(`?q=${slug}&status=unpaid`);
        expect(all.statusCounts).toEqual({ paid: 1, unpaid: 1, refunded: 2 });
        expect(picked.statusCounts).toEqual(all.statusCounts);
        expect(picked.ids).toEqual([st.short]);
    });

    it("the export keeps the status filter", async () => {
        const res = await get(
            "/billing/invoices/export?month=2026-10&status=refunded",
            people.billing,
        );
        expect(res.status).toBe(200);
        const csv = await res.text();
        expect(csv).toContain("Buyer 11");
        expect(csv).toContain("Buyer 13");
        expect(csv).not.toContain("Buyer 12");
        expect(csv).not.toContain("Buyer 1,");
    });

    it("refuses a status it doesn't know", async () => {
        expect(
            (await get("/billing/invoices?status=overdue", people.billing))
                .status,
        ).toBe(400);
    });
});

describe("the business's own invoice list stays its own", () => {
    it("returns only business A's invoices to business A's owner", async () => {
        const service = new SarohInvoicesService();
        const rows = await service.list({
            organizationId: orgs.a,
            userId: people.owner,
            role: "OWNER",
        } as never);
        expect(rows.map((r) => r.id)).toEqual([invoices.a]);
        await expect(
            service.pdf(
                {
                    organizationId: orgs.a,
                    userId: people.owner,
                    role: "OWNER",
                } as never,
                invoices.b,
            ),
        ).rejects.toMatchObject({ status: 404 });
    });
});
