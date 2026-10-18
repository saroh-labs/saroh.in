/**
 * Admin › Billing's queue and controls over HTTP against a real Postgres
 * (DEC-166, owner 17 Oct 2026: "check and verify the controls for the
 * admin"):
 *
 * - Who: no session 401; a business owner, Support (even with an open
 *   support-access session for the business), Operations and the Auditor
 *   403 on every read and write; Billing reads and acts.
 * - Each write takes a reason, changes what it says, goes on the admin
 *   ledger, and is idempotent: the same key replays its answer, a new key
 *   on something already done changes nothing.
 * - Mark resolved, end autopay (the plan runs to the end of what is paid,
 *   the provider told to stop, the business emailed), re-check a refused
 *   double-charge refund after the owner refunded it by hand, sync the
 *   business's billing profile's customer again (DEC-167), record a hand refund on an invoice (a
 *   credit-note question raised for the CA).
 *
 * The real staff guards run; only Better Auth is a stand-in (a test
 * header), as in `admin-billing.db.spec.ts`. The billing provider is the
 * fake: no Razorpay call is made. Catalogue, prices and seller are made up
 * (`fakeCatalog`). Integration project (TEST_DATABASE_URL).
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

import { createHmac } from "node:crypto";

import type { INestApplication } from "@nestjs/common";
import { Logger, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { Job } from "@saroh/database";
import {
    prisma,
    startOnFreePlan,
    writeCatalogueVersion,
} from "@saroh/database";
import { planRows } from "@saroh/pricing-catalog";

import { giveBillingDetails } from "../../../test/business-details";
import { fakeCatalog } from "../../../test/fixtures/pricing-catalog";
import { AllExceptionsFilter } from "../../common/filters/all-exceptions.filter";
import { PlatformAdminGuard } from "../../common/guards/platform-admin.guard";
import { PlatformPermissionGuard } from "../../common/guards/platform-permission.guard";
import { IdempotencyService } from "../../common/idempotency/idempotency.service";
import type { OrganizationContext } from "../../common/types/organization-context";
import { validationPipeOptions } from "../../common/validation";
import { AuditService } from "../audit/audit.service";
import { BILLING_EMAIL_TYPE } from "../billing/billing-email.job";
import { raiseBillingOpsNoticeInTx } from "../billing/billing-ops-notice";
import { BillingWebhookService } from "../billing/billing-webhook.service";
import { CheckoutService } from "../billing/checkout.service";
import {
    BILLING_REFUND_TYPE,
    recordDoubleChargeInTx,
    REFUNDED_AUDIT_ACTION,
} from "../billing/double-charge";
import { DoubleChargeRefundHandler } from "../billing/double-charge-refund.job";
import { PlansService } from "../billing/plans.service";
import { BILLING_PROVIDER_CANCEL_TYPE } from "../billing/provider-cancel.job";
import {
    FakeBillingProvider,
    FakeBillingProviderFactory,
} from "../billing/providers/fake.provider";
import { SarohInvoicesService } from "../billing/saroh-invoices.service";
import type { SarohSeller } from "../billing/saroh-seller";
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

const SECRET = "whsec_fake_platform_secret";
const DAY = 24 * 60 * 60 * 1000;
const tag = `${process.pid}-${Date.now()}`;

const SELLER: SarohSeller = {
    name: "Saroh",
    legalName: "Example Labs Pvt Ltd",
    gstin: "29AAAAA0000A1Z5",
    state: "29",
    address: "1 Test Road, Testville",
    email: "billing@example.test",
    sac: "999999",
    prefix: "TST",
};

let app: INestApplication;
let url: string;
let fake: FakeBillingProvider;
let checkout: CheckoutService;
let webhooks: BillingWebhookService;

const people = {
    owner: "",
    support: "",
    operations: "",
    auditor: "",
    billing: "",
};
let supportSession = "";
let paying: OrganizationContext;
let payingSub = "";
let payingRef = "";
let periodEnd: Date;

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
                    create: { role, reason: "billing controls spec" },
                },
            },
        })
    ).id;
}

let seq = 0;
async function business(): Promise<OrganizationContext> {
    seq += 1;
    const org = await prisma.organization.create({
        data: { name: `Controls ${seq}`, slug: `controls-${seq}-${tag}` },
    });
    await startOnFreePlan(prisma, org.id, { planId: "free" });
    await giveBillingDetails(org.id);
    return { organizationId: org.id, userId: people.owner, role: "OWNER" };
}

let evt = 0;
function deliver(
    providerSubscriptionId: string,
    phase: "activated" | "charged",
    over: { currentPeriodEnd?: Date; paymentId?: string; amountPaise?: number },
) {
    evt += 1;
    const raw = Buffer.from(
        JSON.stringify({
            providerEventId: `evt_controls_${evt}_${tag}`,
            type: `subscription.${phase}`,
            providerSubscriptionId,
            status: "ACTIVE",
            phase,
            eventAt: new Date().toISOString(),
            ...(over.paymentId ? { providerPaymentId: over.paymentId } : {}),
            ...(over.amountPaise !== undefined
                ? { paymentAmountPaise: over.amountPaise }
                : {}),
            ...(over.currentPeriodEnd
                ? { currentPeriodEnd: over.currentPeriodEnd.toISOString() }
                : {}),
        }),
    );
    const signature = createHmac("sha256", SECRET).update(raw).digest("hex");
    return webhooks.handle("razorpay", raw, { "x-fake-signature": signature });
}

/** Free → Plan B monthly, paid; its provider subscription's id. */
async function onPaidPlan(ctx: OrganizationContext, end: Date) {
    const r = await checkout.changePlan(ctx, { plan: "b", cycle: "month" });
    if (r.kind === "TO_FREE") throw new Error("expected a checkout");
    const ref = `fake_sub_${r.checkout.id}`;
    await deliver(ref, "activated", {
        currentPeriodEnd: end,
        paymentId: `pay_${seq}x${tag.replace(/\D/g, "")}`,
    });
    return ref;
}

function get(path: string, as?: string, headers: Record<string, string> = {}) {
    return fetch(`${url}/admin${path}`, {
        headers: { ...(as ? { "x-test-user": as } : {}), ...headers },
    });
}

function post(
    path: string,
    body: Record<string, unknown>,
    as?: string,
    headers: Record<string, string> = {},
) {
    return fetch(`${url}/admin${path}`, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            ...(as ? { "x-test-user": as } : {}),
            ...headers,
        },
        body: JSON.stringify(body),
    });
}

let keyN = 0;
const key = () => `spec-key-${tag}-${(keyN += 1)}`;

async function ledger(action: string, targetId?: string) {
    return prisma.adminAuditEvent.findMany({
        where: { action, ...(targetId ? { targetId } : {}) },
    });
}

beforeAll(async () => {
    fake = new FakeBillingProvider("RAZORPAY", SECRET);
    const factory = new FakeBillingProviderFactory(fake);
    checkout = new CheckoutService(
        new PlansService(),
        factory,
        new AuditService(),
    );
    webhooks = new BillingWebhookService(
        factory,
        undefined,
        new SarohInvoicesService(SELLER),
    );

    const moduleRef = await Test.createTestingModule({
        controllers: [AdminBillingControlsController, AdminBillingController],
        providers: [
            AdminBillingActionsService,
            AdminBillingControlsService,
            AdminBillingService,
            AdminAuditService,
            AdminAccessService,
            IdempotencyService,
            { provide: CheckoutService, useValue: checkout },
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

    // The made-up catalogue, live since yesterday, its paid plans synced.
    await prisma.plan.deleteMany({
        where: { key: { startsWith: "catalog." } },
    });
    await prisma.pricingCatalogVersion.deleteMany({});
    const catalog = fakeCatalog();
    const rows = planRows(catalog, 1);
    const { planIds } = await writeCatalogueVersion(prisma, {
        version: 1,
        catalog,
        goLiveAt: new Date(Date.now() - DAY),
        policy: "keep",
        planRows: rows,
    });
    await prisma.pricingProviderPlan.createMany({
        data: planIds
            .filter((_, i) => rows[i]!.priceCents > 0)
            .map((planId) => ({
                planId,
                provider: "RAZORPAY",
                status: "SYNCED",
                providerPlanId: `plan_${planId}`,
            })),
    });

    people.owner = await user("owner");
    people.support = await user("support");
    const supportAdmin = await staff(people.support, "SUPPORT");
    people.operations = await user("operations");
    await staff(people.operations, "OPERATIONS");
    people.auditor = await user("auditor");
    await staff(people.auditor, "AUDITOR");
    people.billing = await user("billing");
    await staff(people.billing, "BILLING");

    paying = await business();
    await prisma.membership.create({
        data: {
            organizationId: paying.organizationId,
            userId: people.owner,
            role: "OWNER",
        },
    });
    periodEnd = new Date(Date.now() + 20 * DAY);
    payingRef = await onPaidPlan(paying, periodEnd);
    payingSub = (
        await prisma.subscription.findUniqueOrThrow({
            where: { organizationId: paying.organizationId },
        })
    ).id;

    supportSession = (
        await prisma.adminAccessSession.create({
            data: {
                organizationId: paying.organizationId,
                platformAdminId: supportAdmin,
                actorUserId: people.support,
                reason: "helping the paying business",
                idempotencyKey: `session-${tag}`,
                expiresAt: new Date(Date.now() + DAY),
            },
        })
    ).id;
});

afterAll(async () => {
    // No clean-up of rows here: the integration setup truncates every table
    // after the file, and its afterAll runs first and ends the pool.
    await app?.close();
});

describe("Admin › Billing controls: who may read and act (DEC-166)", () => {
    const reads = () => ["/billing/actions", "/billing/events"];
    const writes = (): [string, Record<string, unknown>][] => [
        ["/billing/actions/no-such-action/resolve", {}],
        [`/billing/subscriptions/${payingSub}/end-autopay`, {}],
        ["/billing/refunds/pay_nothing0/recheck", {}],
        [`/billing/organizations/${paying.organizationId}/customer/sync`, {}],
        [
            "/billing/invoices/no-such-invoice/refunds",
            {
                providerPaymentId: "pay_nothing0",
                providerRefundId: "rfnd_nothing0",
                amountPaise: 100,
            },
        ],
    ];
    const body = (extra: Record<string, unknown>) => ({
        reason: "spec checking access",
        idempotencyKey: key(),
        ...extra,
    });

    it("401 with no session, on every read and write", async () => {
        for (const path of reads()) {
            expect((await get(path)).status).toBe(401);
        }
        for (const [path, extra] of writes()) {
            expect((await post(path, body(extra))).status).toBe(401);
        }
    });

    it("403 for a business owner, Operations and the Auditor, on every read and write", async () => {
        for (const who of [people.owner, people.operations, people.auditor]) {
            for (const path of reads()) {
                expect((await get(path, who)).status).toBe(403);
            }
            for (const [path, extra] of writes()) {
                expect((await post(path, body(extra), who)).status).toBe(403);
            }
        }
    });

    it("403 for Support, even with an open support-access session for the business", async () => {
        const session = { [ACCESS_SESSION_HEADER]: supportSession };
        for (const path of reads()) {
            expect((await get(path, people.support, session)).status).toBe(403);
        }
        for (const [path, extra] of writes()) {
            const res = await post(path, body(extra), people.support, session);
            expect(res.status).toBe(403);
        }
        // Nothing it tried changed anything.
        expect(
            (
                await prisma.subscription.findUniqueOrThrow({
                    where: { id: payingSub },
                })
            ).freeChosenAt,
        ).toBeNull();
    });

    it("200 for Billing on the reads, each on the ledger", async () => {
        for (const path of reads()) {
            expect((await get(path, people.billing)).status).toBe(200);
        }
        const actions = (
            await prisma.adminAuditEvent.findMany({
                where: { actorUserId: people.billing },
            })
        ).map((e) => e.action);
        expect(actions).toEqual(
            expect.arrayContaining([
                "billing.actions.list",
                "billing.events.list",
            ]),
        );
    });

    it("refuses a write with no reason (400) before anything changes", async () => {
        const res = await post(
            `/billing/organizations/${paying.organizationId}/customer/sync`,
            { idempotencyKey: key() },
            people.billing,
        );
        expect(res.status).toBe(400);
        expect(await ledger("billing.profile.sync")).toHaveLength(0);
    });
});

describe("Needs action: mark resolved (DEC-166)", () => {
    it("lists an ops notice's row across businesses, and resolves it once, on the ledger", async () => {
        const ctx = await business();
        await prisma.$transaction((tx) =>
            raiseBillingOpsNoticeInTx(tx, new Logger("spec"), {
                code: "billing_spec_notice",
                organizationId: ctx.organizationId,
                refs: { payment: "pay_spec1" },
                note: "Refund it by hand.",
            }),
        );
        const listed = (await (
            await get("/billing/actions", people.billing)
        ).json()) as {
            items: { id: string; code: string; organization: { id: string } }[];
            openCount: number;
        };
        const row = listed.items.find((i) => i.code === "billing_spec_notice");
        expect(row?.organization.id).toBe(ctx.organizationId);
        expect(listed.openCount).toBeGreaterThanOrEqual(1);

        const k = key();
        const first = await post(
            `/billing/actions/${row!.id}/resolve`,
            { reason: "Refunded in Razorpay", idempotencyKey: k },
            people.billing,
        );
        expect(first.status).toBe(201);
        expect(await first.json()).toEqual({ ok: true, changed: true });
        // The same attempt again: the same answer, nothing new.
        const replay = await post(
            `/billing/actions/${row!.id}/resolve`,
            { reason: "Refunded in Razorpay", idempotencyKey: k },
            people.billing,
        );
        expect(await replay.json()).toEqual({ ok: true, changed: true });
        // Another operator's attempt: already resolved, changes nothing.
        const again = await post(
            `/billing/actions/${row!.id}/resolve`,
            { reason: "Also looked at it", idempotencyKey: key() },
            people.billing,
        );
        expect(await again.json()).toEqual({ ok: true, changed: false });

        expect(
            await prisma.billingAction.findUniqueOrThrow({
                where: { id: row!.id },
            }),
        ).toMatchObject({
            resolvedBy: people.billing,
            resolution: "Refunded in Razorpay",
        });
        expect(await ledger("billing.action.resolved", row!.id)).toEqual([
            expect.objectContaining({
                actorUserId: people.billing,
                permission: "saroh-billing:act",
                organizationId: ctx.organizationId,
                reason: "Refunded in Razorpay",
            }),
        ]);
        const resolved = (await (
            await get("/billing/actions?state=resolved", people.billing)
        ).json()) as { items: { id: string }[] };
        expect(resolved.items.map((i) => i.id)).toContain(row!.id);
    });
});

describe("End autopay, keeping the paid period (DEC-166)", () => {
    it("moves the business to Free at the end of what is paid, stops the provider, emails it, once", async () => {
        const k = key();
        const res = await post(
            `/billing/subscriptions/${payingSub}/end-autopay`,
            { reason: "Owner asked by email to stop", idempotencyKey: k },
            people.billing,
        );
        expect(res.status).toBe(201);
        const answer = (await res.json()) as {
            changed: boolean;
            effectiveAt: string;
        };
        expect(answer.changed).toBe(true);
        expect(new Date(answer.effectiveAt).getTime()).toBe(
            periodEnd.getTime(),
        );

        const sub = await prisma.subscription.findUniqueOrThrow({
            where: { id: payingSub },
            include: { plan: true, pendingPlan: true },
        });
        expect(sub).toMatchObject({
            status: "ACTIVE",
            cancelAtPeriodEnd: true,
            pendingFrom: periodEnd,
            plan: { key: "catalog.b" },
            pendingPlan: { key: "catalog.free" },
        });
        expect(sub.freeChosenAt).not.toBeNull();

        const cancels = await prisma.job.findMany({
            where: {
                type: BILLING_PROVIDER_CANCEL_TYPE,
                organizationId: paying.organizationId,
            },
        });
        expect(cancels.map((j) => j.payload)).toContainEqual(
            expect.objectContaining({ providerSubscriptionId: payingRef }),
        );
        const emails = (
            await prisma.job.findMany({
                where: {
                    type: BILLING_EMAIL_TYPE,
                    organizationId: paying.organizationId,
                },
            })
        ).filter(
            (j) => (j.payload as { kind?: string }).kind === "AUTOPAY_ENDED",
        );
        expect(emails).toHaveLength(1);
        expect(await ledger("billing.autopay.ended", payingSub)).toEqual([
            expect.objectContaining({
                actorUserId: people.billing,
                permission: "saroh-billing:act",
                reason: "Owner asked by email to stop",
            }),
        ]);
        // The business's own history shows Saroh support, not a member.
        const own = await prisma.auditEvent.findFirst({
            where: {
                organizationId: paying.organizationId,
                actorUserId: people.billing,
            },
            orderBy: { createdAt: "desc" },
        });
        expect(own?.metadata).toMatchObject({ byOperator: true });

        // Asked again, under a new key: already ending, nothing more.
        const again = await post(
            `/billing/subscriptions/${payingSub}/end-autopay`,
            { reason: "Double-checking", idempotencyKey: key() },
            people.billing,
        );
        expect(await again.json()).toMatchObject({ changed: false });
        expect(await ledger("billing.autopay.ended", payingSub)).toHaveLength(
            1,
        );
    });

    it("refuses a business with no autopay (409)", async () => {
        const ctx = await business();
        const free = await prisma.subscription.findUniqueOrThrow({
            where: { organizationId: ctx.organizationId },
        });
        const res = await post(
            `/billing/subscriptions/${free.id}/end-autopay`,
            { reason: "Nothing to end", idempotencyKey: key() },
            people.billing,
        );
        expect(res.status).toBe(409);
    });
});

describe("Re-check a double charge's refund (DEC-166)", () => {
    it("after a refused refund the owner made by hand: refunded once, emailed, the refund kept", async () => {
        const ctx = await business();
        const payment = `pay_twice${seq}x${tag.replace(/\D/g, "")}`;
        await prisma.$transaction((tx) =>
            recordDoubleChargeInTx(tx, new Logger("spec"), {
                organizationId: ctx.organizationId,
                provider: "RAZORPAY",
                providerSubscriptionId: "fake_sub_twice",
                providerPaymentId: payment,
                amountPaise: 118_000,
                reason: "Charged twice in spec",
            }),
        );
        const handler = new DoubleChargeRefundHandler(
            new FakeBillingProviderFactory(fake),
        );
        const job = await prisma.job.findFirstOrThrow({
            where: {
                type: BILLING_REFUND_TYPE,
                organizationId: ctx.organizationId,
            },
        });
        // Razorpay refuses: the owner is asked to refund by hand.
        fake.refunds.failNext("REFUSED");
        await handler.handle(job);
        expect(
            await prisma.billingAction.findFirst({
                where: {
                    organizationId: ctx.organizationId,
                    code: "billing_double_charge_refund_given_up",
                    resolvedAt: null,
                },
            }),
        ).not.toBeNull();
        await prisma.job.update({
            where: { id: job.id },
            data: { status: "DONE" },
        });

        // The owner refunded it in Razorpay; the operator re-checks.
        const res = await post(
            `/billing/refunds/${payment}/recheck`,
            { reason: "Refunded by hand in Razorpay", idempotencyKey: key() },
            people.billing,
        );
        expect(await res.json()).toEqual({ ok: true, changed: true });
        const requeued = await prisma.job.findFirstOrThrow({
            where: {
                type: BILLING_REFUND_TYPE,
                organizationId: ctx.organizationId,
                status: "PENDING",
            },
        });
        expect(requeued.payload).toMatchObject({
            providerPaymentId: payment,
            amountPaise: 118_000,
        });
        await handler.handle(requeued as Job);

        expect(
            await prisma.adminAuditEvent.count({
                where: { action: REFUNDED_AUDIT_ACTION, targetId: payment },
            }),
        ).toBe(1);
        expect(
            await prisma.billingRefund.findFirst({
                where: { providerPaymentId: payment },
            }),
        ).toMatchObject({
            organizationId: ctx.organizationId,
            source: "AUTO",
            kind: "REFUND",
        });
        expect(
            (
                await prisma.job.findMany({
                    where: {
                        type: BILLING_EMAIL_TYPE,
                        organizationId: ctx.organizationId,
                    },
                })
            ).filter(
                (j) =>
                    (j.payload as { kind?: string }).kind ===
                    "DOUBLE_CHARGE_REFUNDED",
            ),
        ).toHaveLength(1);
        expect(await ledger("billing.refund.recheck", payment)).toHaveLength(1);

        // Asked again: already refunded, nothing queued.
        const again = await post(
            `/billing/refunds/${payment}/recheck`,
            { reason: "Checking once more", idempotencyKey: key() },
            people.billing,
        );
        expect(await again.json()).toEqual({
            ok: true,
            changed: false,
            already: "refunded",
        });
    });

    it("404 for a payment Saroh owes no double-charge refund on", async () => {
        const res = await post(
            "/billing/refunds/pay_unknown123/recheck",
            { reason: "Looking", idempotencyKey: key() },
            people.billing,
        );
        expect(res.status).toBe(404);
    });
});

describe("Sync the provider's customer again (DEC-166, DEC-167)", () => {
    const profileJobs = (billingProfileId: string) =>
        prisma.job.count({
            where: {
                type: "billing.profile.sync",
                status: "PENDING",
                payload: {
                    path: ["billingProfileId"],
                    equals: billingProfileId,
                },
            },
        });

    it("queues one sync of the business's billing profile, on the ledger; a second while one waits changes nothing", async () => {
        const ctx = await business();
        const { billingProfileId } =
            await prisma.organization.findUniqueOrThrow({
                where: { id: ctx.organizationId },
                select: { billingProfileId: true },
            });
        expect(billingProfileId).not.toBeNull();
        await prisma.job.deleteMany({
            where: { type: "billing.profile.sync" },
        });
        const path = `/billing/organizations/${ctx.organizationId}/customer/sync`;
        const first = await post(
            path,
            { reason: "Owner changed email", idempotencyKey: key() },
            people.billing,
        );
        expect(await first.json()).toEqual({ ok: true, changed: true });
        const second = await post(
            path,
            { reason: "Owner changed email", idempotencyKey: key() },
            people.billing,
        );
        expect(await second.json()).toEqual({ ok: true, changed: false });
        expect(await profileJobs(billingProfileId!)).toBe(1);
        // Not DEC-165's per-business job any more.
        expect(
            await prisma.job.count({
                where: {
                    type: "billing.customer.sync",
                    organizationId: ctx.organizationId,
                    status: "PENDING",
                },
            }),
        ).toBe(0);
        const rows = await ledger("billing.profile.sync", ctx.organizationId);
        expect(rows).toHaveLength(2);
        expect(rows[0]!.metadata).toEqual(
            expect.objectContaining({ billingProfileId }),
        );
    });

    it("409 in plain words for a business with no billing profile yet, queuing nothing", async () => {
        seq += 1;
        const org = await prisma.organization.create({
            data: { name: `Controls ${seq}`, slug: `controls-${seq}-${tag}` },
        });
        const res = await post(
            `/billing/organizations/${org.id}/customer/sync`,
            { reason: "Owner asked", idempotencyKey: key() },
            people.billing,
        );
        expect(res.status).toBe(409);
        expect(
            ((await res.json()) as { error: { message: string } }).error
                .message,
        ).toMatch(/hasn't chosen a billing profile/);
        expect(await ledger("billing.profile.sync", org.id)).toHaveLength(0);
    });
});

describe("Record a refund the owner made by hand (DEC-166)", () => {
    it("keeps it on the invoice, asks about a credit note, and shows it on the sheet", async () => {
        const invoice = await prisma.sarohInvoice.findFirstOrThrow({
            where: { organizationId: paying.organizationId },
        });
        expect(invoice.providerPaymentId).not.toBeNull();
        const path = `/billing/invoices/${invoice.id}/refunds`;

        const wrong = await post(
            path,
            {
                providerPaymentId: "pay_someoneelse1",
                providerRefundId: "rfnd_handmade1",
                amountPaise: 1_000,
                reason: "Goodwill refund",
                idempotencyKey: key(),
            },
            people.billing,
        );
        expect(wrong.status).toBe(409);

        const tooMuch = await post(
            path,
            {
                providerPaymentId: invoice.providerPaymentId,
                providerRefundId: "rfnd_handmade1",
                amountPaise: invoice.totalPaise + 1,
                reason: "Goodwill refund",
                idempotencyKey: key(),
            },
            people.billing,
        );
        expect(tooMuch.status).toBe(409);

        const k = key();
        const body = {
            providerPaymentId: invoice.providerPaymentId,
            providerRefundId: "rfnd_handmade1",
            amountPaise: 1_000,
            reason: "Goodwill refund",
            idempotencyKey: k,
        };
        const res = await post(path, body, people.billing);
        expect(res.status).toBe(201);
        const answer = (await res.json()) as { changed: boolean };
        expect(answer.changed).toBe(true);
        const replay = await post(path, body, people.billing);
        expect(await replay.json()).toEqual(answer);

        expect(
            await prisma.billingRefund.findMany({
                where: { invoiceId: invoice.id },
            }),
        ).toEqual([
            expect.objectContaining({
                source: "MANUAL",
                status: "PROCESSED",
                amountPaise: 1_000,
                recordedBy: people.billing,
                organizationId: paying.organizationId,
            }),
        ]);
        expect(
            await prisma.billingAction.findFirst({
                where: {
                    organizationId: paying.organizationId,
                    code: "billing_credit_note_may_be_needed",
                },
            }),
        ).not.toBeNull();
        expect(
            await ledger("billing.refund.recorded", invoice.id),
        ).toHaveLength(1);

        const detail = (await (
            await get(`/billing/subscriptions/${payingSub}`, people.billing)
        ).json()) as {
            invoices: { id: string; refunds: { providerRefundId: string }[] }[];
            refunds: unknown[];
            openActions: { code: string }[];
        };
        expect(
            detail.invoices.find((i) => i.id === invoice.id)?.refunds,
        ).toEqual([
            expect.objectContaining({ providerRefundId: "rfnd_handmade1" }),
        ]);
        expect(detail.openActions.map((a) => a.code)).toContain(
            "billing_credit_note_may_be_needed",
        );

        // Found by its payment id, on the invoice list and the subscriptions.
        const byPayment = (await (
            await get(
                `/billing/invoices?q=${invoice.providerPaymentId}`,
                people.billing,
            )
        ).json()) as { items: { id: string }[] };
        expect(byPayment.items.map((i) => i.id)).toEqual([invoice.id]);
        // Another business billed to the same profile: the sheet names it,
        // and the profile's customer id finds both (DEC-167).
        const profile = await prisma.billingProfile.findFirstOrThrow({
            where: { organizations: { some: { id: paying.organizationId } } },
        });
        // Razorpay's shape (the fake's own ids aren't `cust_…`).
        const customer = `cust_spec${tag.replace(/\D/g, "")}`;
        await prisma.billingProfile.update({
            where: { id: profile.id },
            data: { providerCustomerId: customer },
        });
        seq += 1;
        const sibling = await prisma.organization.create({
            data: {
                name: `Sibling ${seq}`,
                slug: `sibling-${seq}-${tag}`,
                billingProfileId: profile.id,
            },
        });
        await startOnFreePlan(prisma, sibling.id, { planId: "free" });
        const siblingSub = await prisma.subscription.findFirstOrThrow({
            where: { organizationId: sibling.id },
        });
        const sheet = (await (
            await get(`/billing/subscriptions/${payingSub}`, people.billing)
        ).json()) as { billingProfile: Record<string, unknown> | null };
        expect(sheet.billingProfile).toEqual(
            expect.objectContaining({
                id: profile.id,
                legalName: profile.legalName,
                billingEmail: profile.billingEmail,
                gstin: profile.gstin,
                providerCustomerId: customer,
                contactWithheld: false,
                otherBusinesses: [{ id: sibling.id, name: sibling.name }],
            }),
        );
        expect(sheet).not.toHaveProperty("billingCustomer");
        const bySub = (await (
            await get(`/billing/subscriptions?q=${customer}`, people.billing)
        ).json()) as { items: { id: string }[] };
        expect(bySub.items.map((i) => i.id).sort()).toEqual(
            [payingSub, siblingSub.id].sort(),
        );
    });
});
