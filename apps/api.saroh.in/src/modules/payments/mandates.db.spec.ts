/**
 * A mandate ends with its subscription, a privacy removal or a merge
 * (round-2 D20), against a real Postgres: every path that moves a
 * subscription to CANCELLED, a merge, the synchronous cancel a removal
 * uses, and the `mandate.cancel` job with the fake provider — its retries,
 * a redelivery, and the one-ACTIVE-per-subscription index.
 *
 * Only the app env is stubbed (for the credential key). Runs in the
 * integration project (TEST_DATABASE_URL).
 */
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        NODE_ENV: "test",
    },
}));

import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";

import { giveBusinessDetails } from "../../../test/business-details";
import type { OrganizationContext } from "../../common/types/organization-context";
import type { MergeContactsDto } from "../customer-workspace/merge.dto";
import { MergeService } from "../customer-workspace/merge.service";
import { InvoicesService } from "../invoices/invoices.service";
import { SubscriptionsService } from "../subscriptions/subscriptions.service";
import { MANDATE_CANCEL_TYPE } from "./mandate-cancel-job";
import { MandateCancelHandler } from "./mandate-cancel.handler";
import { MandatesService } from "./mandates.service";
import { PaymentsService } from "./payments.service";
import {
    FakeMerchantProvider,
    FakeProviderFactory,
} from "./providers/fake.provider";

const fake = new FakeMerchantProvider();
const payments = new PaymentsService(new FakeProviderFactory(fake));
const mandates = new MandatesService(new FakeProviderFactory(fake));
const handler = new MandateCancelHandler(mandates);
const subscriptions = new SubscriptionsService(new InvoicesService());
const merges = new MergeService();

const tag = `${process.pid}-${Date.now()}`;
let n = 0;
const next = () => `${tag}-${++n}`;

let owner: OrganizationContext;
let planId: string;

beforeAll(async () => {
    const user = await prisma.user.create({
        data: { email: `d20-owner-${tag}@x.com` },
    });
    const org = await prisma.organization.create({
        data: { name: "Northwind", slug: `d20-${tag}` },
    });
    await giveBusinessDetails(org.id);
    owner = { organizationId: org.id, userId: user.id, role: "OWNER" };
    await payments.connectProvider(owner, {
        provider: "RAZORPAY",
        publicKey: "rzp_test_Public1",
        keyId: "rzp_test_Public1",
        keySecret: "rzp_secret",
        webhookSecret: "whsec_d20",
    });
    planId = (
        await subscriptions.createPlan(owner, {
            name: "Monthly",
            price: "1200",
            currency: "INR",
            interval: "MONTH",
        })
    ).id;
});

beforeEach(() => {
    fake.mandateCancelCalls.length = 0;
});

async function person(createdAt?: Date): Promise<string> {
    return (
        await prisma.contact.create({
            data: {
                organizationId: owner.organizationId,
                email: `p-${next()}@example.in`,
                firstName: "Asha",
                ...(createdAt ? { createdAt } : {}),
            },
        })
    ).id;
}

/** Someone on the plan, paying by autopay. */
async function member(
    over: { contactId?: string; providerMandateId?: string | null } = {},
): Promise<{ contactId: string; subscriptionId: string; mandateId: string }> {
    const contactId = over.contactId ?? (await person());
    const sub = await subscriptions.subscribe(owner, { contactId, planId });
    const mandate = await prisma.paymentMandate.create({
        data: {
            organizationId: owner.organizationId,
            contactId,
            subscriptionId: sub.id,
            provider: "RAZORPAY",
            providerCustomerId: `cust_${next()}`,
            providerMandateId:
                over.providerMandateId === undefined
                    ? `token_${next()}`
                    : over.providerMandateId,
            displayHint: "asha@okbank",
            status: "ACTIVE",
            activatedAt: new Date(),
        },
    });
    return { contactId, subscriptionId: sub.id, mandateId: mandate.id };
}

const mandateOf = (id: string) =>
    prisma.paymentMandate.findUniqueOrThrow({ where: { id } });

const pendingJobs = () =>
    prisma.job.findMany({
        where: {
            organizationId: owner.organizationId,
            type: MANDATE_CANCEL_TYPE,
            status: "PENDING",
        },
        orderBy: { createdAt: "asc" },
    });

/** Run each waiting `mandate.cancel` job once, as the worker would. */
async function drain(): Promise<{ done: number; retried: number }> {
    const counts = { done: 0, retried: 0 };
    for (const job of await pendingJobs()) {
        try {
            await handler.handle(job);
            await prisma.job.update({
                where: { id: job.id },
                data: { status: "DONE" },
            });
            counts.done += 1;
        } catch {
            // Left PENDING for the next attempt, as the backoff would.
            await prisma.job.update({
                where: { id: job.id },
                data: { attempts: { increment: 1 } },
            });
            counts.retried += 1;
        }
    }
    return counts;
}

/** Push a subscription's period into the past so its renewal is due. */
async function makeDue(id: string): Promise<void> {
    const start = new Date(Date.now() - 40 * 86_400_000);
    await prisma.customerSubscription.update({
        where: { id },
        data: {
            anchorAt: start,
            currentPeriodStart: start,
            currentPeriodEnd: new Date(Date.now() - 86_400_000),
        },
    });
}

afterEach(async () => {
    // Each test reads only its own jobs.
    await prisma.job.deleteMany({ where: { type: MANDATE_CANCEL_TYPE } });
});

describe("a subscription's end cancels its autopay", () => {
    it("staff cancel now: cancelled at once, confirmed by one job", async () => {
        const m = await member();
        await subscriptions.cancel(owner, m.subscriptionId, { when: "now" });

        const cancelled = await mandateOf(m.mandateId);
        expect(cancelled).toMatchObject({
            status: "CANCELLED",
            cancelReason: "SUBSCRIPTION_ENDED",
            cancelConfirmedAt: null,
        });
        expect(cancelled.cancelledAt).not.toBeNull();
        const jobs = await pendingJobs();
        expect(jobs).toHaveLength(1);
        expect(jobs[0]!.payload).toEqual({ subscriptionId: m.subscriptionId });

        const event = await prisma.subscriptionEvent.findFirst({
            where: {
                subscriptionId: m.subscriptionId,
                kind: "MANDATE_CANCELLED",
            },
        });
        expect(event).toMatchObject({
            actorKind: "JOB",
            data: { reason: "SUBSCRIPTION_ENDED" },
        });

        await expect(drain()).resolves.toEqual({ done: 1, retried: 0 });
        expect(fake.mandateCancelCalls).toHaveLength(1);
        expect(fake.mandateCancelCalls[0]).toMatchObject({
            providerMandateId: cancelled.providerMandateId,
            credentials: { keyId: "rzp_test_Public1", keySecret: "rzp_secret" },
        });
        expect((await mandateOf(m.mandateId)).cancelConfirmedAt).not.toBeNull();
    });

    it("cancel at period end: nothing until the renewal ends it", async () => {
        const m = await member();
        await subscriptions.cancel(owner, m.subscriptionId, {
            when: "periodEnd",
        });
        expect((await mandateOf(m.mandateId)).status).toBe("ACTIVE");
        expect(await pendingJobs()).toHaveLength(0);

        await makeDue(m.subscriptionId);
        await expect(
            subscriptions.renewOne(m.subscriptionId, new Date()),
        ).resolves.toBe("ended");
        expect(await mandateOf(m.mandateId)).toMatchObject({
            status: "CANCELLED",
            cancelReason: "SUBSCRIPTION_ENDED",
        });
        await drain();
        expect(fake.mandateCancelCalls).toHaveLength(1);
    });

    it("the customer's own cancel (A8) ends autopay when the plan ends", async () => {
        const m = await member();
        const scope = {
            organizationId: owner.organizationId,
            contactId: m.contactId,
            accountId: `acct_${next()}`,
        };
        await expect(
            subscriptions.cancelForCustomer(scope, m.subscriptionId),
        ).resolves.toMatchObject({ outcome: "scheduled" });
        expect((await mandateOf(m.mandateId)).status).toBe("ACTIVE");

        await makeDue(m.subscriptionId);
        await subscriptions.renewOne(m.subscriptionId, new Date());
        expect((await mandateOf(m.mandateId)).status).toBe("CANCELLED");
    });

    it("the customer's cancel of a paused plan ends autopay now", async () => {
        const m = await member();
        await prisma.customerSubscription.update({
            where: { id: m.subscriptionId },
            data: { status: "PAUSED", pausedAt: new Date() },
        });
        await expect(
            subscriptions.cancelForCustomer(
                {
                    organizationId: owner.organizationId,
                    contactId: m.contactId,
                    accountId: `acct_${next()}`,
                },
                m.subscriptionId,
            ),
        ).resolves.toMatchObject({ outcome: "now" });
        expect(await mandateOf(m.mandateId)).toMatchObject({
            status: "CANCELLED",
            cancelReason: "SUBSCRIPTION_ENDED",
        });
        expect(await pendingJobs()).toHaveLength(1);
    });

    it("a resume past a period set to end ends autopay too", async () => {
        const m = await member();
        await prisma.customerSubscription.update({
            where: { id: m.subscriptionId },
            data: {
                status: "PAUSED",
                pausedAt: new Date(Date.now() - 45 * 86_400_000),
                cancelAtPeriodEnd: true,
            },
        });
        await makeDue(m.subscriptionId);
        await subscriptions.resume(owner, m.subscriptionId);
        expect(
            (
                await prisma.customerSubscription.findUniqueOrThrow({
                    where: { id: m.subscriptionId },
                })
            ).status,
        ).toBe("CANCELLED");
        expect((await mandateOf(m.mandateId)).status).toBe("CANCELLED");
    });

    it("keeps autopay on a subscription that only renews", async () => {
        const m = await member();
        await makeDue(m.subscriptionId);
        await expect(
            subscriptions.renewOne(m.subscriptionId, new Date()),
        ).resolves.toBe("renewed");
        expect((await mandateOf(m.mandateId)).status).toBe("ACTIVE");
        expect(await pendingJobs()).toHaveLength(0);
    });

    it("a set-up that never reached the provider is confirmed without a call or a job", async () => {
        const m = await member({ providerMandateId: null });
        await subscriptions.cancel(owner, m.subscriptionId, { when: "now" });
        const row = await mandateOf(m.mandateId);
        expect(row.status).toBe("CANCELLED");
        expect(row.cancelConfirmedAt).not.toBeNull();
        expect(await pendingJobs()).toHaveLength(0);
        expect(fake.mandateCancelCalls).toHaveLength(0);
    });
});

describe("the mandate.cancel job", () => {
    it("a timeout leaves it cancelled and unconfirmed, and the job asks again", async () => {
        const m = await member();
        await subscriptions.cancel(owner, m.subscriptionId, { when: "now" });
        fake.failNextMandateCancel("UNKNOWN");

        await expect(drain()).resolves.toEqual({ done: 0, retried: 1 });
        // Never chargeable again, whatever the provider says later.
        expect(await mandateOf(m.mandateId)).toMatchObject({
            status: "CANCELLED",
            cancelConfirmedAt: null,
        });

        await expect(drain()).resolves.toEqual({ done: 1, retried: 0 });
        expect(fake.mandateCancelCalls).toHaveLength(2);
        expect((await mandateOf(m.mandateId)).cancelConfirmedAt).not.toBeNull();
    });

    it("delivered twice, asks the provider once", async () => {
        const m = await member();
        await subscriptions.cancel(owner, m.subscriptionId, { when: "now" });
        const [job] = await pendingJobs();
        await handler.handle(job as Job);
        await handler.handle(job as Job);
        expect(fake.mandateCancelCalls).toHaveLength(1);
    });

    it("a refusal stays cancelled in Saroh and isn't retried", async () => {
        const m = await member();
        await subscriptions.cancel(owner, m.subscriptionId, { when: "now" });
        fake.failNextMandateCancel("REFUSED");
        await expect(drain()).resolves.toEqual({ done: 1, retried: 0 });
        expect(await mandateOf(m.mandateId)).toMatchObject({
            status: "CANCELLED",
            cancelConfirmedAt: null,
        });
    });
});

describe("a merge cancels the merged-away person's autopay", () => {
    it("never moves it to the survivor", async () => {
        const survivorId = await person(new Date("2026-01-01T00:00:00Z"));
        const m = await member({
            contactId: await person(new Date("2026-06-01T00:00:00Z")),
        });

        await merges.merge(owner, survivorId, m.contactId, {
            survivorId,
        } as MergeContactsDto);

        const row = await mandateOf(m.mandateId);
        expect(row).toMatchObject({
            status: "CANCELLED",
            cancelReason: "MERGED",
            contactId: m.contactId,
            cancelConfirmedAt: null,
        });
        // The subscription follows the person; its autopay doesn't.
        expect(
            (
                await prisma.customerSubscription.findUniqueOrThrow({
                    where: { id: m.subscriptionId },
                })
            ).contactId,
        ).toBe(survivorId);
        expect(
            await prisma.paymentMandate.count({
                where: {
                    OR: [
                        { contactId: survivorId },
                        { subscriptionId: m.subscriptionId },
                    ],
                    status: { not: "CANCELLED" },
                },
            }),
        ).toBe(0);
        const jobs = await pendingJobs();
        expect(jobs.map((j) => j.payload)).toEqual([
            { contactId: m.contactId },
        ]);

        await drain();
        expect(fake.mandateCancelCalls).toHaveLength(1);
        expect((await mandateOf(m.mandateId)).cancelConfirmedAt).not.toBeNull();
    });

    it("a merge of someone without autopay queues nothing", async () => {
        const survivorId = await person(new Date("2026-01-01T00:00:00Z"));
        const otherId = await person(new Date("2026-06-01T00:00:00Z"));
        await merges.merge(owner, survivorId, otherId, {
            survivorId,
        } as MergeContactsDto);
        expect(await pendingJobs()).toHaveLength(0);
    });
});

describe("cancelFor: a privacy removal's cancel (C11)", () => {
    it("cancels and confirms before the removal goes ahead", async () => {
        const m = await member();
        const result = await mandates.cancelFor(
            { organizationId: owner.organizationId, contactId: m.contactId },
            "PRIVACY_REMOVAL",
        );
        expect(result).toEqual({
            cancelled: 1,
            awaitingProvider: 1,
            unconfirmed: 0,
            refused: 0,
        });
        const row = await mandateOf(m.mandateId);
        expect(row).toMatchObject({
            status: "CANCELLED",
            cancelReason: "PRIVACY_REMOVAL",
        });
        expect(row.cancelConfirmedAt).not.toBeNull();
        // The provider ids stay, so a late webhook still finds the row.
        expect(row.providerMandateId).not.toBeNull();
        expect(await pendingJobs()).toHaveLength(0);
    });

    it("an unsure answer says so, and a retry asks only what is unconfirmed", async () => {
        const contactId = await person();
        const first = await member({ contactId });
        // A second plan, so one person holds two mandates.
        const other = await subscriptions.createPlan(owner, {
            name: `Yearly ${next()}`,
            price: "12000",
            currency: "INR",
            interval: "YEAR",
        });
        const sub = await subscriptions.subscribe(owner, {
            contactId,
            planId: other.id,
        });
        const second = await prisma.paymentMandate.create({
            data: {
                organizationId: owner.organizationId,
                contactId,
                subscriptionId: sub.id,
                provider: "RAZORPAY",
                providerMandateId: `token_${next()}`,
                status: "ACTIVE",
            },
        });
        fake.failNextMandateCancel("UNKNOWN");

        const scope = { organizationId: owner.organizationId, contactId };
        const unsure = await mandates.cancelFor(scope, "PRIVACY_REMOVAL");
        expect(unsure).toMatchObject({ cancelled: 2, unconfirmed: 1 });
        // A job keeps asking in the meantime.
        expect(await pendingJobs()).toHaveLength(1);

        fake.mandateCancelCalls.length = 0;
        const again = await mandates.cancelFor(scope, "PRIVACY_REMOVAL");
        expect(again).toEqual({
            cancelled: 0,
            awaitingProvider: 0,
            unconfirmed: 0,
            refused: 0,
        });
        // Only the unconfirmed one was asked again.
        expect(fake.mandateCancelCalls).toHaveLength(1);
        for (const id of [first.mandateId, second.id]) {
            expect((await mandateOf(id)).cancelConfirmedAt).not.toBeNull();
        }
    });
});

describe("the model", () => {
    it("refuses a second ACTIVE mandate for one subscription", async () => {
        const m = await member();
        await expect(
            prisma.paymentMandate.create({
                data: {
                    organizationId: owner.organizationId,
                    contactId: m.contactId,
                    subscriptionId: m.subscriptionId,
                    provider: "RAZORPAY",
                    status: "ACTIVE",
                },
            }),
        ).rejects.toMatchObject({ code: "P2002" });
    });

    it("leaves no live mandate on an ended subscription or a merged contact", async () => {
        // The unit's verification query, over everything the tests above did.
        const orphans = await prisma.paymentMandate.count({
            where: {
                status: { in: ["PENDING", "ACTIVE", "PAUSED"] },
                OR: [
                    { subscription: { status: "CANCELLED" } },
                    { contact: { mergedIntoId: { not: null } } },
                ],
            },
        });
        expect(orphans).toBe(0);
    });
});
