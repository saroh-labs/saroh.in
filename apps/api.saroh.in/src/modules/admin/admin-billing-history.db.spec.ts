/**
 * A subscription's history (admin plan U15, R27) over HTTP against a real
 * Postgres: `GET /admin/billing/subscriptions/:id/history` merges what the
 * billing provider sent, the invoices Saroh issued and emailed, the billing
 * emails sent or failed, and what staff and Saroh did, newest first.
 *
 * - The merge order across all five sources, and only this business's.
 * - The chips: provider events, invoices, Saroh and staff.
 * - **Never a provider event's payload**, on any page or chip.
 * - Paging: no row skipped or repeated, and `hasMore`.
 * - Refusals: no session 401; a business owner, Support (with a support
 *   session) and the Auditor 403; staff without `saroh-billing:read` refused
 *   by the service itself too.
 * - The read is on the admin ledger, and stays out of the timeline.
 *
 * Better Auth is a stand-in (Jest cannot load it), as in
 * `admin-billing.db.spec.ts`. Amounts are made up. Integration project
 * (TEST_DATABASE_URL); runs plain and with TEST_RLS=on.
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
import { ForbiddenException, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { prisma } from "@saroh/database";

import { AllExceptionsFilter } from "../../common/filters/all-exceptions.filter";
import { PlatformAdminGuard } from "../../common/guards/platform-admin.guard";
import { PlatformPermissionGuard } from "../../common/guards/platform-permission.guard";
import { validationPipeOptions } from "../../common/validation";
import {
    BILLING_EMAIL_NOTICE_KIND,
    BILLING_EMAIL_TYPE,
} from "../billing/billing-email.job";
import { BILLING_NOTE_AUTHOR } from "../billing/billing-ops-notice";
import { AdminAccessService } from "./admin-access.service";
import { AdminAuditService } from "./admin-audit.service";
import type { BillingHistoryPage } from "./admin-billing-history";
import { HISTORY_PAGE_SIZE } from "./admin-billing-history";
import { AdminBillingController } from "./admin-billing.controller";
import { AdminBillingService } from "./admin-billing.service";
import { AdminPermission } from "./admin-permissions";
import {
    ACCESS_SESSION_HEADER,
    OrganizationAccessSessionGuard,
} from "./organization-access-session.guard";

const tag = `${process.pid}-${Date.now()}`;
const DAY = 24 * 60 * 60 * 1000;
/** A made-up secret in every payload: it must never come back. */
const SECRET = `never-returned-${tag}`;

let app: INestApplication;
let url: string;

const people = { owner: "", support: "", auditor: "", billing: "" };
const orgs = { a: "", b: "", c: "" };
const subs = { a: "", b: "", c: "" };
let supportSession = "";

/** A fixed moment on 1 Oct 2026, `h` hours in. */
const at = (h: number) => new Date(Date.UTC(2026, 9, 1, h));

async function user(name: string): Promise<string> {
    return (
        await prisma.user.create({
            data: { email: `${name}-${tag}@example.com`, name },
        })
    ).id;
}

async function staff(userId: string, role: string): Promise<string> {
    return (
        await prisma.platformAdmin.create({
            data: {
                userId,
                roleAssignments: {
                    create: { role, reason: "billing history spec" },
                },
            },
        })
    ).id;
}

async function business(name: string, planId: string, status: string) {
    const org = await prisma.organization.create({
        data: { name, slug: `${name.toLowerCase()}-${tag}` },
    });
    const sub = await prisma.subscription.create({
        data: { organizationId: org.id, planId, status },
    });
    return { org: org.id, sub: sub.id };
}

/** A Saroh invoice with made-up amounts that satisfy the CHECKs. */
async function invoice(
    organizationId: string,
    n: number,
    issuedAt: Date,
    emailedAt: Date | null,
) {
    const taxable = 10_000 * n;
    const half = 900 * n;
    return prisma.sarohInvoice.create({
        data: {
            organizationId,
            number: `HST/${tag.slice(-6)}/${n}`,
            series: `HST/${tag}`,
            chargeKey: `history:${tag}:${n}`,
            source: "RENEWAL",
            provider: "RAZORPAY",
            providerEventId: `evt_inv_${tag}_${n}`,
            providerPaymentId: `pay_hst${n}x${tag.replace(/\D/g, "")}`,
            planName: "Plan H",
            cycle: "month",
            issuedAt,
            emailedAt,
            sellerName: "Example Labs",
            billToName: `Buyer ${n}`,
            billToGstin: null,
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
}

function get(path: string, as?: string, headers: Record<string, string> = {}) {
    return fetch(`${url}/admin${path}`, {
        headers: { ...(as ? { "x-test-user": as } : {}), ...headers },
    });
}

async function history(
    subscriptionId: string,
    query = "",
): Promise<{ text: string; page: BillingHistoryPage }> {
    const res = await get(
        `/billing/subscriptions/${subscriptionId}/history${query}`,
        people.billing,
    );
    expect(res.status).toBe(200);
    const text = await res.text();
    return { text, page: JSON.parse(text) as BillingHistoryPage };
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

    const plan = await prisma.plan.create({
        data: {
            key: `history.${tag}`,
            version: 1,
            name: "Plan H",
            priceCents: 11_100,
            interval: "month",
            entitlements: {},
        },
    });
    ({ org: orgs.a, sub: subs.a } = await business(
        "HistA",
        plan.id,
        "PAST_DUE",
    ));
    ({ org: orgs.b, sub: subs.b } = await business("HistB", plan.id, "ACTIVE"));
    ({ org: orgs.c, sub: subs.c } = await business("HistC", plan.id, "ACTIVE"));

    people.owner = await user("owner");
    await prisma.membership.create({
        data: { organizationId: orgs.a, userId: people.owner, role: "OWNER" },
    });
    people.support = await user("support");
    const supportAdmin = await staff(people.support, "SUPPORT");
    people.auditor = await user("auditor");
    await staff(people.auditor, "AUDITOR");
    people.billing = await user("Asha Billing");
    await staff(people.billing, "BILLING");
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

    // Business A: one row from each source, an hour apart.
    // 1h: the provider charged (with a payload that must never come back).
    await prisma.billingWebhookEvent.create({
        data: {
            provider: "RAZORPAY",
            providerEventId: `evt_charged_${tag}`,
            type: "subscription.charged",
            organizationId: orgs.a,
            payload: { secret: SECRET, card: { last4: "4242" } },
            receivedAt: at(1),
            processedAt: at(1),
        },
    });
    // 2h: the invoice; 3h: its email.
    await invoice(orgs.a, 1, at(2), at(3));
    // 4h: a payment-failed email, sent.
    await prisma.customerNotice.create({
        data: {
            organizationId: orgs.a,
            eventKey: `saroh-billing:payment-failed:evt_${tag}`,
            kind: BILLING_EMAIL_NOTICE_KIND,
            createdAt: at(4),
        },
    });
    // Another notice kind (not billing) never shows.
    await prisma.customerNotice.create({
        data: {
            organizationId: orgs.a,
            eventKey: `booking:${tag}`,
            kind: "BOOKING_CONFIRMED",
            createdAt: at(4),
        },
    });
    // 5h: a billing email that failed; a DONE one says nothing again.
    await prisma.job.create({
        data: {
            organizationId: orgs.a,
            type: BILLING_EMAIL_TYPE,
            status: "FAILED",
            attempts: 5,
            payload: {
                kind: "TERM_ENDING",
                organizationId: orgs.a,
                note: SECRET,
            },
            createdAt: at(5),
        },
    });
    await prisma.job.create({
        data: {
            organizationId: orgs.a,
            type: BILLING_EMAIL_TYPE,
            status: "DONE",
            payload: { kind: "INVOICE", organizationId: orgs.a },
            createdAt: at(5),
        },
    });
    // 6h: staff ended the autopay; 7h: Saroh found a double charge.
    await prisma.adminAuditEvent.create({
        data: {
            actorUserId: people.billing,
            permission: AdminPermission.SarohBillingAct,
            action: "billing.autopay.ended",
            targetType: "subscription",
            targetId: subs.a,
            organizationId: orgs.a,
            reason: "Owner asked by phone",
            outcome: "SUCCESS",
            idempotencyKey: `end-${tag}`,
            createdAt: at(6),
        },
    });
    await prisma.adminAuditEvent.create({
        data: {
            actorUserId: BILLING_NOTE_AUTHOR,
            permission: "system",
            action: "billing.double_charge.refund",
            targetType: "payment",
            targetId: `pay_dbl${tag.replace(/\D/g, "")}`,
            organizationId: orgs.a,
            reason: "Charged twice",
            outcome: "SUCCESS",
            idempotencyKey: `claim-${tag}`,
            createdAt: at(7),
        },
    });
    // A read on the ledger (no key) is not history.
    await prisma.adminAuditEvent.create({
        data: {
            actorUserId: people.billing,
            permission: AdminPermission.SarohBillingRead,
            action: "billing.subscription.read",
            targetType: "subscription",
            targetId: subs.a,
            organizationId: orgs.a,
            outcome: "SUCCESS",
            createdAt: at(8),
        },
    });

    // Business B's rows never reach A's history.
    await prisma.billingWebhookEvent.create({
        data: {
            provider: "RAZORPAY",
            providerEventId: `evt_b_${tag}`,
            type: "subscription.cancelled",
            organizationId: orgs.b,
            payload: { secret: SECRET },
            receivedAt: at(9),
        },
    });

    // Business C: more events than a page, for paging.
    await prisma.billingWebhookEvent.createMany({
        data: Array.from({ length: HISTORY_PAGE_SIZE + 7 }, (_, i) => ({
            provider: "RAZORPAY",
            providerEventId: `evt_c${i}_${tag}`,
            type: "subscription.charged",
            organizationId: orgs.c,
            payload: { secret: SECRET },
            receivedAt: new Date(at(0).getTime() + i * 60_000),
        })),
    });
});

afterAll(async () => {
    // The integration setup truncates every table after the file.
    await app?.close();
});

describe("Admin › Billing › a subscription's history: who may read it", () => {
    const path = () => `/billing/subscriptions/${subs.a}/history`;

    it("401 with no session", async () => {
        expect((await get(path())).status).toBe(401);
    });

    it("403 for a business owner who is not staff, even of that business", async () => {
        expect((await get(path(), people.owner)).status).toBe(403);
    });

    it("403 for Support, even with an open support-access session", async () => {
        const res = await get(path(), people.support, {
            [ACCESS_SESSION_HEADER]: supportSession,
        });
        expect(res.status).toBe(403);
    });

    it("403 for the read-only Auditor", async () => {
        expect((await get(path(), people.auditor)).status).toBe(403);
    });

    it("the service refuses staff without saroh-billing:read itself", async () => {
        const service = app.get(AdminBillingService);
        await expect(
            service.history(
                {
                    userId: people.support,
                    permissions: [AdminPermission.OrganizationRead],
                } as never,
                subs.a,
            ),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("404 for a subscription that doesn't exist; 400 for an unknown chip", async () => {
        expect(
            (await get("/billing/subscriptions/nope/history", people.billing))
                .status,
        ).toBe(404);
        expect(
            (await get(`${path()}?show=payloads`, people.billing)).status,
        ).toBe(400);
    });
});

describe("Admin › Billing › a subscription's history", () => {
    it("merges all five sources, newest first, and only this business's", async () => {
        const { page } = await history(subs.a);
        expect(page.items.map((r) => [r.at, r.kind, r.title])).toEqual([
            [at(7).toISOString(), "staff", "Saroh found a double charge"],
            [at(6).toISOString(), "staff", "Autopay ended by staff"],
            [
                at(5).toISOString(),
                "email",
                "Email failed to send: the autopay is running out",
            ],
            [at(4).toISOString(), "email", "Emailed: a payment failed"],
            [
                at(3).toISOString(),
                "email",
                `Emailed invoice HST/${tag.slice(-6)}/1`,
            ],
            [
                at(2).toISOString(),
                "invoice",
                `Invoice HST/${tag.slice(-6)}/1 issued`,
            ],
            [at(1).toISOString(), "provider", "Razorpay charged the plan"],
        ]);
        expect(page.hasMore).toBe(false);
        expect(page.page).toBe(1);
        expect(page.show).toBe("everything");

        const staffRow = page.items.find((r) => r.title.startsWith("Autopay"));
        expect(staffRow?.line).toBe("Asha Billing: Owner asked by phone");
        const saroh = page.items[0];
        expect(saroh.line).toBe("Saroh: Charged twice");
        const provider = page.items.at(-1);
        expect(provider?.refs).toEqual({
            provider: "RAZORPAY",
            type: "subscription.charged",
            event: `evt_charged_${tag}`,
        });
        expect(provider?.line).toBe("Saroh applied it.");
        // Every row has the shape the sheet draws.
        for (const row of page.items) {
            expect(Object.keys(row).sort()).toEqual(
                ["at", "id", "kind", "line", "refs", "title"].sort(),
            );
        }
    });

    it("the chips narrow it: provider events, invoices, Saroh and staff", async () => {
        const kinds = async (show: string) =>
            (await history(subs.a, `?show=${show}`)).page.items.map(
                (r) => r.kind,
            );
        expect(await kinds("provider")).toEqual(["provider"]);
        expect(await kinds("invoices")).toEqual(["invoice"]);
        expect(await kinds("saroh")).toEqual([
            "staff",
            "staff",
            "email",
            "email",
            "email",
        ]);
        expect(await kinds("everything")).toHaveLength(7);
    });

    it("never returns a provider event's payload, or a job's beyond its kind", async () => {
        for (const show of ["everything", "provider", "saroh"]) {
            const { text } = await history(subs.a, `?show=${show}`);
            expect(text).not.toContain(SECRET);
            expect(text).not.toContain("4242");
            expect(text).not.toContain("payload");
        }
        for (const p of [1, 2]) {
            const { text } = await history(subs.c, `?page=${p}`);
            expect(text).not.toContain(SECRET);
        }
    });

    it("pages without skipping or repeating a row", async () => {
        const one = (await history(subs.c)).page;
        const two = (await history(subs.c, "?page=2")).page;
        expect(one.items).toHaveLength(HISTORY_PAGE_SIZE);
        expect(one.hasMore).toBe(true);
        expect(two.items).toHaveLength(7);
        expect(two.hasMore).toBe(false);
        const ids = [...one.items, ...two.items].map((r) => r.id);
        expect(new Set(ids).size).toBe(HISTORY_PAGE_SIZE + 7);
        const times = [...one.items, ...two.items].map((r) => r.at);
        expect(times).toEqual([...times].sort().reverse());
        // Page 3 is empty, not an error.
        const three = (await history(subs.c, "?page=3")).page;
        expect(three.items).toEqual([]);
        expect(three.hasMore).toBe(false);
    });

    it("an empty history is an empty page", async () => {
        const { page } = await history(subs.b, "?show=invoices");
        expect(page.items).toEqual([]);
        expect(page.hasMore).toBe(false);
    });

    it("records the read on the admin ledger, and the read stays out of the timeline", async () => {
        const reads = await prisma.adminAuditEvent.findMany({
            where: {
                actorUserId: people.billing,
                action: "billing.subscription.history",
                targetId: subs.a,
            },
            select: { organizationId: true, permission: true },
        });
        expect(reads.length).toBeGreaterThan(0);
        expect(reads[0]).toEqual({
            organizationId: orgs.a,
            permission: AdminPermission.SarohBillingRead,
        });
        const { page } = await history(subs.a, "?show=saroh");
        expect(page.items.map((r) => r.title)).not.toContain(
            "billing.subscription.history",
        );
    });
});
