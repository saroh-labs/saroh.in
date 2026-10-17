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
import { validationPipeOptions } from "../../common/validation";
import { SarohInvoicesService } from "../billing/saroh-invoices.service";
import { AdminAccessService } from "./admin-access.service";
import { AdminAuditService } from "./admin-audit.service";
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
        controllers: [AdminBillingController],
        providers: [
            AdminBillingService,
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
