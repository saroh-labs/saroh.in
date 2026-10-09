/**
 * Refunds owed hold a deletion back (#921, owner 9 Oct), against a real
 * Postgres:
 *
 * - every source of a refund not yet back with a customer is found, each
 *   once: a refund on its way (sent, or being confirmed), one the provider
 *   refused, an invoice paid twice, a capture at the wrong amount, a
 *   payment on a replaced edit charge, and a send still queued;
 * - the sweep leaves a business that owes one PENDING_DELETION past its
 *   window, notes it on the admin ledger, flags it for the directory and
 *   puts it on the deletion trail — and deletes it once all are settled;
 * - the clean-up leaves a refund's send queued and deletes the messaging
 *   keys with the payment keys.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { prisma } from "@saroh/database";
import { createMemoryStorage } from "@saroh/object-storage";

import { DeletedBusinessBilling } from "../billing/business-closing";
import type { EntitlementService } from "../billing/entitlement.service";
import type { BillingProviderFactory } from "../billing/providers/billing-provider.port";
import type { DomainVerifier } from "../domains/domain-verifier";
import { DomainsService } from "../domains/domains.service";
import { FakeDomainHosting } from "../domains/providers/fake-hosting";
import { MediaService } from "../media/media.service";
import { mismatchRefundKey } from "../payments/mismatch-refund";
import { refundsOutstanding } from "../payments/refunds-outstanding";
import { SEND_REFUND_TYPE } from "../payments/send-refund-type";
import { AdminAuditService } from "./admin-audit.service";
import {
    businessesWaitingOnRefunds,
    deletionRefunds,
    deletionTrail,
} from "./deletion-trail";
import {
    ORGANIZATION_DELETION_CLEANUP_TYPE,
    OrganizationDeletionCleanupHandler,
} from "./organization-deletion-cleanup.handler";
import {
    ORGANIZATION_DELETION_WAITING_ACTION,
    OrganizationDeletionHandler,
} from "./organization-deletion.handler";

const tag = `${process.pid}x${Date.now() % 100000}`;
let seq = 0;
const uniq = (label: string) => `${label}-${tag}-${++seq}`;
const DAY = 86_400_000;

const sweep = new OrganizationDeletionHandler(new AdminAuditService());
const cleanup = new OrganizationDeletionCleanupHandler(
    new DeletedBusinessBilling({
        get: jest.fn(() => ({ cancelSubscription: jest.fn() })),
    } as unknown as BillingProviderFactory),
    new DomainsService(
        {} as DomainVerifier,
        {} as EntitlementService,
        new FakeDomainHosting(),
    ),
    new MediaService(createMemoryStorage()),
);

let orgId = "";
let storeId = "";
let customerId = "";

async function order(label: string) {
    return prisma.order.create({
        data: {
            storeId,
            organizationId: orgId,
            orderId: uniq(label),
            customerId,
            currency: "INR",
            subtotal: "500.00",
            tax: "0.00",
            total: "500.00",
            status: "PENDING",
            paymentStatus: "PAID",
            fulfilment: "PICKUP",
        },
    });
}

async function intent(data: {
    orderId?: string;
    invoiceId?: string;
    status: string;
    amountCents?: number;
}) {
    return prisma.paymentIntent.create({
        data: {
            organizationId: orgId,
            provider: "RAZORPAY",
            amountCents: data.amountCents ?? 50_000,
            currency: "INR",
            status: data.status,
            orderId: data.orderId ?? null,
            invoiceId: data.invoiceId ?? null,
        },
    });
}

/** Each source's row, by what refundsOutstanding keys it as. */
const keys: Record<string, string> = {};
const ids: Record<string, string> = {};

beforeAll(async () => {
    const org = await prisma.organization.create({
        data: {
            name: "Rye",
            slug: uniq("rye"),
            lifecycleStatus: "PENDING_DELETION",
            deletionScheduledAt: new Date(Date.now() - DAY),
            deletionScheduledBy: "staff_1",
        },
    });
    orgId = org.id;
    storeId = (
        await prisma.store.create({
            data: {
                name: "Hill Road",
                slug: uniq("hill"),
                organizationId: orgId,
            },
        })
    ).id;
    customerId = (
        await prisma.customer.create({
            data: {
                storeId,
                organizationId: orgId,
                email: `${uniq("buyer")}@example.com`,
                firstName: "Farah",
                lastName: "Khan",
            },
        })
    ).id;

    // 1. On its way: the provider took it and hasn't confirmed it.
    const o1 = await order("CONF");
    const i1 = await intent({ orderId: o1.id, status: "SUCCEEDED" });
    const r1 = await prisma.paymentRefund.create({
        data: {
            organizationId: orgId,
            paymentIntentId: i1.id,
            amountCents: 10_000,
            currency: "INR",
            status: "PENDING",
            providerRefundId: "rfnd_conf",
        },
    });
    keys.confirming = `refund:${r1.id}`;
    ids.confirming = r1.id;

    // 2. Being sent, with its send still queued: listed once.
    const r2 = await prisma.paymentRefund.create({
        data: {
            organizationId: orgId,
            paymentIntentId: i1.id,
            amountCents: 5_000,
            currency: "INR",
            status: "PENDING",
        },
    });
    keys.sending = `refund:${r2.id}`;
    ids.sending = r2.id;
    await prisma.job.create({
        data: {
            organizationId: orgId,
            type: SEND_REFUND_TYPE,
            payload: { refundId: r2.id },
        },
    });

    // 3. Refused by the provider, nothing since.
    const o3 = await order("FAIL");
    const i3 = await intent({ orderId: o3.id, status: "SUCCEEDED" });
    const r3 = await prisma.paymentRefund.create({
        data: {
            organizationId: orgId,
            paymentIntentId: i3.id,
            amountCents: 20_000,
            currency: "INR",
            status: "FAILED",
            providerRefundId: "rfnd_failed",
        },
    });
    keys.failed = `refund:${r3.id}`;
    ids.failedIntent = i3.id;

    // 4. An invoice paid twice: the second payment is owed back.
    const invoice = await prisma.invoice.create({
        data: {
            organizationId: orgId,
            status: "PAID",
            number: uniq("INV"),
            currency: "INR",
            subtotal: "300.00",
            total: "300.00",
        },
    });
    const i4 = await intent({
        invoiceId: invoice.id,
        status: "SUCCEEDED",
        amountCents: 30_000,
    });
    await prisma.paymentAttempt.create({
        data: {
            organizationId: orgId,
            paymentIntentId: i4.id,
            provider: "RAZORPAY",
            providerRef: "pay_twice",
            status: "CAPTURED_NEEDS_REFUND",
            rawResponse: { invoiceStatus: "PAID" },
        },
    });
    keys.invoice = `intent:${i4.id}`;
    ids.invoiceIntent = i4.id;

    // 5. Captured at the wrong amount (PAY-06).
    const o5 = await order("MISM");
    const i5 = await intent({ orderId: o5.id, status: "FAILED" });
    const a5 = await prisma.paymentAttempt.create({
        data: {
            organizationId: orgId,
            paymentIntentId: i5.id,
            provider: "RAZORPAY",
            providerRef: "pay_mismatch",
            status: "CAPTURED_NEEDS_REFUND",
            rawResponse: {
                invoiceStatus: "AMOUNT_MISMATCH",
                capturedAmountCents: 45_000,
                capturedCurrency: "INR",
            },
        },
    });
    keys.mismatch = `attempt:${a5.id}`;
    ids.mismatchAttempt = a5.id;
    ids.mismatchIntent = i5.id;

    // 6. Paid on an edit charge a later edit replaced.
    const o6 = await order("EDIT");
    const i6 = await intent({
        orderId: o6.id,
        status: "SUPERSEDED",
        amountCents: 7_000,
    });
    await prisma.paymentAttempt.create({
        data: {
            organizationId: orgId,
            paymentIntentId: i6.id,
            provider: "RAZORPAY",
            providerRef: "pay_superseded",
            status: "CAPTURED_NEEDS_REFUND",
            rawResponse: { reason: "SUPERSEDED" },
        },
    });
    keys.owedBack = `intent:${i6.id}`;
    ids.owedBackIntent = i6.id;

    // 7. A send queued for a refund already settled: still a send.
    const r7 = await prisma.paymentRefund.create({
        data: {
            organizationId: orgId,
            paymentIntentId: i1.id,
            amountCents: 1_000,
            currency: "INR",
            status: "SUCCEEDED",
            providerRefundId: "rfnd_done",
        },
    });
    const j7 = await prisma.job.create({
        data: {
            organizationId: orgId,
            type: SEND_REFUND_TYPE,
            payload: { refundId: r7.id },
        },
    });
    keys.queued = `job:${j7.id}`;
    ids.queuedJob = j7.id;

    // Keys the clean-up deletes in the end.
    await prisma.merchantPaymentProvider.create({
        data: {
            organizationId: orgId,
            provider: "RAZORPAY",
            encryptedCredentials: "x",
            credentialsIv: "x",
            credentialsAuthTag: "x",
        },
    });
    await prisma.communicationProvider.create({
        data: {
            organizationId: orgId,
            channel: "EMAIL",
            provider: "RESEND",
            fromAddress: "hello@example.com",
            encryptedCredentials: "x",
            credentialsIv: "x",
            credentialsAuthTag: "x",
        },
    });
});

describe("refunds a closing business still owes (DB, #921)", () => {
    it("finds every source, each once, with what the merchant looks it up by", async () => {
        const owed = await refundsOutstanding(prisma, orgId);
        expect(owed.rows.map((r) => r.key).sort()).toEqual(
            Object.values(keys).sort(),
        );
        const byKey = new Map(owed.rows.map((r) => [r.key, r]));
        expect(byKey.get(keys.confirming)).toMatchObject({
            stage: "CONFIRMING",
            providerRef: "rfnd_conf",
            customer: "Farah Khan",
        });
        expect(byKey.get(keys.sending)).toMatchObject({
            stage: "SENDING",
            providerRef: ids.sending,
        });
        expect(byKey.get(keys.failed)).toMatchObject({
            stage: "FAILED",
            amountCents: 20_000,
        });
        expect(byKey.get(keys.invoice)).toMatchObject({
            stage: "OWED",
            providerRef: "pay_twice",
            paper: { href: expect.stringMatching(/^\/billing\/invoices\//) },
        });
        expect(byKey.get(keys.mismatch)).toMatchObject({
            stage: "OWED",
            amountCents: 45_000,
            providerRef: "pay_mismatch",
        });
        expect(byKey.get(keys.owedBack)).toMatchObject({
            stage: "OWED",
            amountCents: 7_000,
            providerRef: "pay_superseded",
        });
        expect(byKey.get(keys.queued)).toMatchObject({ stage: "SENDING" });
    });

    it("leaves the business PENDING_DELETION past its window, noted, flagged and on its trail", async () => {
        const now = new Date();
        const result = await sweep.sweep(now);
        expect(result.waiting).toContain(orgId);
        expect(result.deleted).not.toContain(orgId);

        const org = await prisma.organization.findUniqueOrThrow({
            where: { id: orgId },
            select: { lifecycleStatus: true, deletedRetainedAt: true },
        });
        expect(org).toEqual({
            lifecycleStatus: "PENDING_DELETION",
            deletedRetainedAt: null,
        });
        expect(
            await prisma.job.count({
                where: {
                    organizationId: orgId,
                    type: ORGANIZATION_DELETION_CLEANUP_TYPE,
                },
            }),
        ).toBe(0);

        // A second run the same day notes it once.
        await sweep.sweep(now);
        expect(
            await prisma.adminAuditEvent.count({
                where: {
                    organizationId: orgId,
                    action: ORGANIZATION_DELETION_WAITING_ACTION,
                },
            }),
        ).toBe(1);

        expect(await businessesWaitingOnRefunds(now, [orgId])).toEqual(
            new Set([orgId]),
        );
        const trail = await deletionTrail(orgId);
        expect(trail[0]).toMatchObject({
            action: ORGANIZATION_DELETION_WAITING_ACTION,
            refunds: { count: 7 },
        });

        // The console's list: names only to a PII reader.
        const hidden = await deletionRefunds(orgId, "PENDING_DELETION", {
            canReadPii: false,
        });
        expect(hidden).toHaveLength(7);
        expect(hidden.every((r) => r.customer === null)).toBe(true);
        const named = await deletionRefunds(orgId, "PENDING_DELETION", {
            canReadPii: true,
        });
        expect(named.some((r) => r.customer === "Farah Khan")).toBe(true);
    });

    it("deletes it once every refund has settled, and the clean-up keeps a queued send", async () => {
        // The provider confirms, or a refund is made in its dashboard.
        await prisma.paymentRefund.updateMany({
            where: { id: { in: [ids.confirming, ids.sending] } },
            data: { status: "SUCCEEDED" },
        });
        await prisma.paymentRefund.create({
            data: {
                organizationId: orgId,
                paymentIntentId: ids.failedIntent,
                amountCents: 20_000,
                currency: "INR",
                status: "SUCCEEDED",
                providerRefundId: "rfnd_dash_1",
            },
        });
        for (const intentId of [ids.invoiceIntent, ids.owedBackIntent]) {
            await prisma.paymentRefund.create({
                data: {
                    organizationId: orgId,
                    paymentIntentId: intentId,
                    amountCents: 1,
                    currency: "INR",
                    status: "SUCCEEDED",
                    providerRefundId: uniq("rfnd_dash"),
                },
            });
        }
        await prisma.paymentRefund.create({
            data: {
                organizationId: orgId,
                paymentIntentId: ids.mismatchIntent,
                amountCents: 45_000,
                currency: "INR",
                status: "SUCCEEDED",
                idempotencyKey: mismatchRefundKey(ids.mismatchAttempt),
            },
        });
        // The queued sends ran.
        await prisma.job.updateMany({
            where: { organizationId: orgId, type: SEND_REFUND_TYPE },
            data: { status: "DONE" },
        });
        expect((await refundsOutstanding(prisma, orgId)).count).toBe(0);

        const result = await sweep.sweep(new Date());
        expect(result.deleted).toContain(orgId);
        expect(await businessesWaitingOnRefunds(new Date(), [orgId])).toEqual(
            new Set(),
        );

        // A refund's send queued after: the clean-up leaves it to run.
        const send = await prisma.job.create({
            data: {
                organizationId: orgId,
                type: SEND_REFUND_TYPE,
                payload: { refundId: ids.confirming },
                runAt: new Date(Date.now() + DAY),
            },
        });
        const first = await cleanup.run(orgId);
        // Never cancelled, and the keys it may need are kept until it ran.
        expect(first.failed).toEqual(["keys"]);
        expect(
            (await prisma.job.findUniqueOrThrow({ where: { id: send.id } }))
                .status,
        ).toBe("PENDING");
        expect(
            await prisma.communicationProvider.count({
                where: { organizationId: orgId },
            }),
        ).toBe(1);

        await prisma.job.update({
            where: { id: send.id },
            data: { status: "DONE" },
        });
        const run = await cleanup.run(orgId);
        expect(run.failed).toEqual([]);
        expect(
            await prisma.communicationProvider.count({
                where: { organizationId: orgId },
            }),
        ).toBe(0);
        expect(
            await prisma.merchantPaymentProvider.count({
                where: { organizationId: orgId },
            }),
        ).toBe(0);
        const trail = await deletionTrail(orgId);
        expect(trail.map((t) => t.action)).toEqual(
            expect.arrayContaining([
                "organization.deletion.cleanup",
                "organization.deleted",
                ORGANIZATION_DELETION_WAITING_ACTION,
            ]),
        );
        expect(
            trail.find((t) => t.action === "organization.deletion.cleanup")
                ?.steps,
        ).toEqual(expect.arrayContaining([{ step: "keys", result: "ok" }]));
    });
});
