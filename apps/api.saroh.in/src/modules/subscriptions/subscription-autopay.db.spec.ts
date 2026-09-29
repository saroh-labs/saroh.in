/**
 * Autopay in the workspace (round-2 D14), end to end with the fake provider
 * against a real Postgres: Subscription Detail's autopay card, "Send a
 * set-up link" (the provider's hosted page for one method, shown once,
 * emailed through D17's path when asked), "Cancel autopay" (provider first:
 * definite, unsure, refused, already off), "Autopay limit too low" and the
 * re-authorisation that clears it, the rollout gate, and who may do what.
 *
 * Only the app env is stubbed (the credential key). Runs in the
 * integration project (TEST_DATABASE_URL).
 */
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        NODE_ENV: "test",
        RENDERER_URL: "https://saroh.app",
    },
}));

import { HttpException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { giveBusinessDetails } from "../../../test/business-details";
import type { OrganizationContext } from "../../common/types/organization-context";
import { env } from "../../env";
import { CommunicationsService } from "../communications/communications.service";
import { SECRET_LINK_SLOT } from "../communications/transactional";
import { FlagKey } from "../feature-flags/flags";
import { InvoicesService } from "../invoices/invoices.service";
import { AutopayService } from "../payments/autopay.service";
import { MANDATE_CANCEL_TYPE } from "../payments/mandate-cancel-job";
import { MandateChargesService } from "../payments/mandate-charges.service";
import { applyMandateChangeInTx } from "../payments/mandate-events";
import { LINK_SETUP_TTL_MS } from "../payments/mandate-rules";
import { MandateSetupService } from "../payments/mandate-setup.service";
import { MandatesService } from "../payments/mandates.service";
import { PaymentsService } from "../payments/payments.service";
import {
    FakeMerchantProvider,
    FakeProviderFactory,
} from "../payments/providers/fake.provider";
import { SubscriptionAutopayService } from "./subscription-autopay.service";
import { SubscriptionsService } from "./subscriptions.service";

const fake = new FakeMerchantProvider("RAZORPAY");
const factory = new FakeProviderFactory(fake);
const payments = new PaymentsService(factory);
const setups = new MandateSetupService(factory);
const autopay = new AutopayService(setups);
const mandates = new MandatesService(factory);
const charges = new MandateChargesService(factory);
const comms = new CommunicationsService();
const staff = new SubscriptionAutopayService(autopay, setups, mandates, comms);
const invoices = new InvoicesService();
const subscriptions = new SubscriptionsService(
    invoices,
    autopay,
    charges,
    staff,
);

const tag = `${process.pid}-${Date.now()}`;
let n = 0;
const next = () => `${tag}-${++n}`;

let owner: OrganizationContext;
/** `subscription:read` only: sees the card, can't act. */
let reader: OrganizationContext;
let planId: string;

beforeAll(async () => {
    const user = await prisma.user.create({
        data: { email: `d14-owner-${tag}@x.com`, name: "Priya Shah" },
    });
    const org = await prisma.organization.create({
        data: { name: "Pulse Fitness", slug: `d14-${tag}` },
    });
    owner = { organizationId: org.id, userId: user.id, role: "OWNER" };
    reader = {
        organizationId: org.id,
        userId: user.id,
        role: "MEMBER",
        actions: new Set(["subscription:read", "invoice:read"]),
    } as OrganizationContext;
    await prisma.businessProfile.create({
        data: { organizationId: org.id, timezone: "Asia/Kolkata" },
    });
    await giveBusinessDetails(org.id);
    await prisma.featureFlag.upsert({
        where: { key: "MODULE_PAYMENTS" },
        create: { key: "MODULE_PAYMENTS", enabledByDefault: false },
        update: {},
    });
    await prisma.featureFlagOverride.create({
        data: {
            flagKey: "MODULE_PAYMENTS",
            organizationId: org.id,
            enabled: true,
        },
    });
    await prisma.organizationModule.create({
        data: {
            organizationId: org.id,
            moduleKey: "PAYMENTS",
            status: "ENABLED",
        },
    });
    await payments.connectProvider(owner, {
        provider: "RAZORPAY",
        publicKey: "rzp_test_D14",
        keyId: "rzp_test_D14",
        keySecret: "rzp_secret",
        webhookSecret: "whsec_d14",
    });
    await comms.connectProvider(owner, {
        channel: "EMAIL",
        provider: "RESEND",
        fromAddress: "hello@pulse.example",
        credentials: { apiKey: "re_test_key" },
    });
    planId = (
        await subscriptions.createPlan(owner, {
            name: "Monthly unlimited",
            price: "1200",
            currency: "INR",
            interval: "MONTH",
        })
    ).id;
});

beforeEach(() => {
    fake.mandateMethodList = ["UPI", "CARD", "EMANDATE"];
    fake.mandateCalls.length = 0;
    fake.mandateCancelCalls.length = 0;
    delete (fake.mandates as { rolloutFlag?: string }).rolloutFlag;
    delete fake.authorisationMinimum.UPI;
});

/** A member on the plan, with its first invoice issued. */
async function member(): Promise<{
    contactId: string;
    subscriptionId: string;
    invoiceId: string;
    email: string;
}> {
    const email = `m-${next()}@example.in`;
    const contactId = (
        await prisma.contact.create({
            data: {
                organizationId: owner.organizationId,
                email,
                firstName: "Meera",
                lastName: "Iyer",
            },
        })
    ).id;
    const sub = await subscriptions.subscribe(owner, { contactId, planId });
    const invoice = await prisma.invoice.findFirstOrThrow({
        where: { subscriptionId: sub.id, status: "ISSUED" },
        select: { id: true },
    });
    return { contactId, subscriptionId: sub.id, invoiceId: invoice.id, email };
}

/** An ACTIVE mandate at the provider, as a customer set up (D12). */
async function activeMandate(
    m: { contactId: string; subscriptionId: string },
    over: { maxAmountCents?: number; activatedAt?: Date } = {},
) {
    return prisma.paymentMandate.create({
        data: {
            organizationId: owner.organizationId,
            contactId: m.contactId,
            subscriptionId: m.subscriptionId,
            provider: "RAZORPAY",
            providerMandateId: `token_${next()}`,
            providerCustomerId: `cust_${next()}`,
            status: "ACTIVE",
            method: "UPI",
            displayHint: "me•••@okicici",
            maxAmountCents: over.maxAmountCents ?? 180_000,
            activatedAt: over.activatedAt ?? new Date(),
            setupSource: "PAY_LINK",
        },
    });
}

async function status(p: Promise<unknown>): Promise<number | undefined> {
    try {
        await p;
        return undefined;
    } catch (e) {
        return e instanceof HttpException ? e.getStatus() : -1;
    }
}

const gateOn = () =>
    Object.assign(fake.mandates, { rolloutFlag: FlagKey.RAZORPAY_AUTOPAY });

const mandatesOf = (subscriptionId: string) =>
    prisma.paymentMandate.findMany({
        where: { organizationId: owner.organizationId, subscriptionId },
        orderBy: { createdAt: "asc" },
    });

describe("the autopay card", () => {
    it("offers a set-up link where the business takes autopay, and where to email it", async () => {
        const m = await member();
        const sub = await subscriptions.get(owner, m.subscriptionId);
        expect(sub.autopay).toBeNull();
        expect(sub.autopayCard).toMatchObject({
            offered: true,
            methods: ["UPI", "CARD", "EMANDATE"],
            setUp: null,
            ended: null,
            limitLow: null,
            emailTo: m.email,
        });
    });

    it("says how an ACTIVE mandate was set up, and the list marks it", async () => {
        const m = await member();
        await activeMandate(m);
        const sub = await subscriptions.get(owner, m.subscriptionId);
        expect(sub.autopay).toMatchObject({ state: "ON", method: "UPI" });
        expect(sub.autopayCard?.setUp).toMatchObject({
            source: "PAY_LINK",
            sentBy: null,
        });
        const row = (await subscriptions.list(owner, {})).find(
            (s) => s.id === m.subscriptionId,
        );
        expect(row?.autopayOn).toEqual({
            method: "UPI",
            hint: "me•••@okicici",
            paused: false,
        });
    });

    it("a role that only reads subscriptions sees the card, and may not act", async () => {
        const m = await member();
        await activeMandate(m);
        const sub = await subscriptions.get(reader, m.subscriptionId);
        expect(sub.autopayCard?.offered).toBe(true);
        expect(
            await status(
                staff.sendLink(reader, m.subscriptionId, { method: "UPI" }),
            ),
        ).toBe(403);
        expect(await status(staff.cancel(reader, m.subscriptionId))).toBe(403);
        const rows = await mandatesOf(m.subscriptionId);
        expect(rows.map((r) => r.status)).toEqual(["ACTIVE"]);
        expect(
            fake.mandateCalls.filter((c) => c.op !== "mandateMethods"),
        ).toHaveLength(0);
        expect(fake.mandateCancelCalls).toHaveLength(0);
    });
});

describe("Send a set-up link", () => {
    it("makes the provider's hosted page for the picked method, shown once, and logs who sent it", async () => {
        fake.authorisationMinimum.UPI = 100;
        const m = await member();
        const before = Date.now();
        const link = await staff.sendLink(owner, m.subscriptionId, {
            method: "UPI",
        });
        expect(link.url).toMatch(
            /^https:\/\/fake\.provider\.test\/authorise\//,
        );
        expect(link).toMatchObject({
            method: "UPI",
            // Half again over the ₹1,200 renewal, to the next ₹100.
            limit: "1800.00",
            currency: "INR",
            // Nothing owed on the link: UPI takes the ₹1 check (DEC-064).
            check: { amount: "1.00", currency: "INR" },
            emailed: null,
        });
        const expires = Date.parse(link.expiresAt) - before;
        expect(expires).toBeGreaterThanOrEqual(LINK_SETUP_TTL_MS - 60_000);
        expect(expires).toBeLessThanOrEqual(LINK_SETUP_TTL_MS + 60_000);

        // The provider was asked for its hosted link, with no return page.
        const setupCall = fake.mandateCalls.find((c) => c.op === "createSetup");
        expect(setupCall?.input).toMatchObject({
            method: "UPI",
            handoff: "HOSTED_LINK",
            maxAmountCents: 180_000,
        });
        expect(setupCall?.input).not.toHaveProperty("returnUrl");

        const [row] = await mandatesOf(m.subscriptionId);
        expect(row).toMatchObject({
            status: "PENDING",
            setupSource: "SETUP_LINK",
            method: "UPI",
        });
        // The ₹1 check is an AUTHORISATION intent, never a sale.
        const check = await prisma.paymentIntent.findFirst({
            where: { checkForMandateId: row?.id },
        });
        expect(check).toMatchObject({
            purpose: "AUTHORISATION",
            amountCents: 100,
        });

        const event = await prisma.subscriptionEvent.findFirstOrThrow({
            where: {
                subscriptionId: m.subscriptionId,
                kind: "MANDATE_LINK_SENT",
            },
        });
        expect(event).toMatchObject({
            actorKind: "TEAM",
            actorUserId: owner.userId,
        });
        expect(event.data).toMatchObject({
            method: "UPI",
            limit: "1800.00",
            mandateId: row?.id,
            emailed: false,
        });
        // The link itself is never stored.
        expect(JSON.stringify(event.data)).not.toContain(link.url);

        const sub = await subscriptions.get(owner, m.subscriptionId);
        expect(sub.autopay).toMatchObject({ state: "PENDING" });
        expect(sub.autopayCard?.setUp).toMatchObject({
            source: "SETUP_LINK",
            sentBy: "Priya Shah",
        });
    });

    it("emails it through D17's path with the link sealed, never in the stored body", async () => {
        const m = await member();
        const link = await staff.sendLink(owner, m.subscriptionId, {
            method: "EMANDATE",
            email: true,
        });
        expect(link.emailed).toEqual({ status: "QUEUED", to: m.email });
        expect(link.check).toBeNull();
        const message = await prisma.message.findFirstOrThrow({
            where: {
                organizationId: owner.organizationId,
                template: "AUTOPAY_SET_UP_LINK",
                toAddress: m.email,
            },
        });
        expect(message.subject).toBe(
            "Turn on autopay for Monthly unlimited with Pulse Fitness",
        );
        expect(message.body).toContain(SECRET_LINK_SLOT);
        expect(message.body).not.toContain(link.url);
        expect(message.body).toContain("bank account");
        const job = await prisma.job.findFirstOrThrow({
            where: {
                organizationId: owner.organizationId,
                type: "message.send",
                payload: { path: ["messageId"], equals: message.id },
            },
        });
        const payload = job.payload as { link?: unknown };
        expect(payload.link).toBeDefined();
        expect(JSON.stringify(payload)).not.toContain(link.url);
        const event = await prisma.subscriptionEvent.findFirstOrThrow({
            where: {
                subscriptionId: m.subscriptionId,
                kind: "MANDATE_LINK_SENT",
            },
        });
        expect(event.data).toMatchObject({ emailed: true });
    });

    it("approved, the mandate comes on from the set-up link, and the log says so", async () => {
        const m = await member();
        await staff.sendLink(owner, m.subscriptionId, { method: "UPI" });
        const [row] = await mandatesOf(m.subscriptionId);
        await prisma.$transaction((tx) =>
            applyMandateChangeInTx(tx, owner.organizationId, "RAZORPAY", {
                status: "ACTIVE",
                setupReference: row?.setupReference ?? undefined,
                providerMandateId: `token_${next()}`,
                method: "UPI",
                displayHint: "me•••@okicici",
            }),
        );
        const set = await prisma.subscriptionEvent.findFirstOrThrow({
            where: { subscriptionId: m.subscriptionId, kind: "MANDATE_SET_UP" },
        });
        expect(set).toMatchObject({ actorKind: "CUSTOMER" });
        expect(set.data).toMatchObject({ source: "SETUP_LINK", method: "UPI" });
        const sub = await subscriptions.get(owner, m.subscriptionId);
        expect(sub.autopay).toMatchObject({ state: "ON" });
        expect(sub.autopayCard?.setUp).toMatchObject({
            source: "SETUP_LINK",
            sentBy: "Priya Shah",
        });
    });

    it("refuses a method the account doesn't offer, an ended subscription, and a pack invoice's id", async () => {
        fake.mandateMethodList = ["UPI"];
        const m = await member();
        expect(
            await status(
                staff.sendLink(owner, m.subscriptionId, { method: "CARD" }),
            ),
        ).toBe(409);

        await subscriptions.cancel(owner, m.subscriptionId, { when: "now" });
        expect(
            await status(
                staff.sendLink(owner, m.subscriptionId, { method: "UPI" }),
            ),
        ).toBe(409);

        // A pack's invoice has no subscription: nothing to set autopay up on.
        const pack = await invoices.createDraft(owner, {
            contactId: m.contactId,
            currency: "INR",
            lines: [
                {
                    description: "10-class pack",
                    quantity: 1,
                    unitPrice: "3000",
                },
            ],
        });
        await prisma.invoice.update({
            where: { id: pack.id },
            data: { source: "PACK" },
        });
        expect(
            await status(staff.sendLink(owner, pack.id, { method: "UPI" })),
        ).toBe(404);
        expect(await mandatesOf(m.subscriptionId)).toHaveLength(0);
        expect(
            fake.mandateCalls.filter((c) => c.op === "createSetup"),
        ).toHaveLength(0);
    });

    it("waits while an autopay charge is under way (D13)", async () => {
        const m = await member();
        await activeMandate(m);
        await prisma.$transaction((tx) =>
            charges.queueInTx(tx, {
                organizationId: owner.organizationId,
                subscriptionId: m.subscriptionId,
                invoiceId: m.invoiceId,
            }),
        );
        expect(
            await status(
                staff.sendLink(owner, m.subscriptionId, { method: "UPI" }),
            ),
        ).toBe(409);
    });
});

describe("the rollout gate (RAZORPAY_AUTOPAY)", () => {
    it("off: nothing is offered, and a link is refused (403) without asking the provider", async () => {
        gateOn();
        const m = await member();
        expect(await staff.offer(owner)).toMatchObject({
            offered: false,
            methods: [],
        });
        const sub = await subscriptions.get(owner, m.subscriptionId);
        expect(sub.autopayCard).toMatchObject({
            offered: false,
            ended: null,
            emailTo: null,
        });
        expect(
            await status(
                staff.sendLink(owner, m.subscriptionId, { method: "UPI" }),
            ),
        ).toBe(403);
        expect(await mandatesOf(m.subscriptionId)).toHaveLength(0);
        expect(
            fake.mandateCalls.filter((c) => c.op === "createSetup"),
        ).toHaveLength(0);
    });

    it("off: a mandate already made still shows, and can still be cancelled", async () => {
        const m = await member();
        await activeMandate(m);
        gateOn();
        const sub = await subscriptions.get(owner, m.subscriptionId);
        expect(sub.autopay).toMatchObject({ state: "ON" });
        expect(sub.autopayCard?.offered).toBe(false);
        const res = await staff.cancel(owner, m.subscriptionId);
        expect(res.outcome).toBe("CANCELLED");
    });
});

describe("Cancel autopay", () => {
    it("definite: cancelled at the provider, logged as the team member, and the next renewal isn't charged", async () => {
        const m = await member();
        const mandate = await activeMandate(m);
        const res = await staff.cancel(owner, m.subscriptionId);
        expect(res).toEqual({
            outcome: "CANCELLED",
            provider: "Razorpay",
            // Emailed through D17's path; the account thread is dark here.
            told: { email: m.email, suppressed: false, account: false },
        });
        expect(fake.mandateCancelCalls).toHaveLength(1);
        const row = await prisma.paymentMandate.findUniqueOrThrow({
            where: { id: mandate.id },
        });
        expect(row).toMatchObject({
            status: "CANCELLED",
            cancelReason: "STAFF",
        });
        expect(row.cancelConfirmedAt).not.toBeNull();
        const event = await prisma.subscriptionEvent.findFirstOrThrow({
            where: {
                subscriptionId: m.subscriptionId,
                kind: "MANDATE_CANCELLED",
            },
        });
        expect(event).toMatchObject({
            actorKind: "TEAM",
            actorUserId: owner.userId,
        });
        expect(event.data).toMatchObject({ reason: "STAFF" });

        // The subscription carries on; its renewal is invoiced, not charged.
        const sub = await subscriptions.get(owner, m.subscriptionId);
        expect(sub.status).toBe("ACTIVE");
        expect(sub.autopay).toBeNull();
        expect(sub.autopayCard?.ended).toMatchObject({
            reason: "STAFF",
            confirmed: true,
        });
        const queued = await prisma.$transaction((tx) =>
            charges.queueInTx(tx, {
                organizationId: owner.organizationId,
                subscriptionId: m.subscriptionId,
                invoiceId: m.invoiceId,
            }),
        );
        expect(queued).toEqual({ status: "NONE" });
        expect(
            await prisma.job.count({
                where: {
                    organizationId: owner.organizationId,
                    type: "subscription.charge",
                    payload: {
                        path: ["subscriptionId"],
                        equals: m.subscriptionId,
                    },
                },
            }),
        ).toBe(0);
    });

    it("unsure: off in Saroh, 'being confirmed', never charged, and a job keeps asking", async () => {
        const m = await member();
        const mandate = await activeMandate(m);
        fake.failNextMandateCancel("UNKNOWN");
        const res = await staff.cancel(owner, m.subscriptionId);
        expect(res.outcome).toBe("CONFIRMING");
        const row = await prisma.paymentMandate.findUniqueOrThrow({
            where: { id: mandate.id },
        });
        expect(row.status).toBe("CANCELLED");
        expect(row.cancelConfirmedAt).toBeNull();
        expect(
            await prisma.job.count({
                where: {
                    organizationId: owner.organizationId,
                    type: MANDATE_CANCEL_TYPE,
                    payload: {
                        path: ["subscriptionId"],
                        equals: m.subscriptionId,
                    },
                },
            }),
        ).toBe(1);
        const sub = await subscriptions.get(owner, m.subscriptionId);
        expect(sub.autopayCard?.ended).toMatchObject({ confirmed: false });
        expect(
            await charges.chargeableMandate(
                owner.organizationId,
                m.subscriptionId,
            ),
        ).toBeNull();
    });

    it("refused: off in Saroh all the same, and staff are told to check the provider", async () => {
        const m = await member();
        await activeMandate(m);
        fake.failNextMandateCancel("REFUSED");
        const res = await staff.cancel(owner, m.subscriptionId);
        // Saroh charges it no more, so the customer is told all the same.
        expect(res).toMatchObject({
            outcome: "REFUSED",
            provider: "Razorpay",
            told: { email: m.email },
        });
        const [row] = await mandatesOf(m.subscriptionId);
        expect(row?.status).toBe("CANCELLED");
    });

    it("already off: says so, and asks nobody", async () => {
        const m = await member();
        await activeMandate(m);
        await staff.cancel(owner, m.subscriptionId);
        fake.mandateCancelCalls.length = 0;
        const again = await staff.cancel(owner, m.subscriptionId);
        expect(again).toEqual({
            outcome: "ALREADY_OFF",
            provider: null,
            told: null,
        });
        expect(fake.mandateCancelCalls).toHaveLength(0);
        const none = await member();
        expect(await staff.cancel(owner, none.subscriptionId)).toEqual({
            outcome: "ALREADY_OFF",
            provider: null,
            told: null,
        });
        // Told once, by the cancel that turned it off.
        expect(await cancelledNotes(m.subscriptionId)).toHaveLength(1);
        expect(
            await prisma.subscriptionEvent.count({
                where: {
                    subscriptionId: m.subscriptionId,
                    kind: "MANDATE_CANCELLED",
                },
            }),
        ).toBe(1);
    });
});

/** The autopay-cancelled emails a member's contact was sent. */
async function cancelledNotes(subscriptionId: string) {
    const sub = await prisma.customerSubscription.findUniqueOrThrow({
        where: { id: subscriptionId },
        select: { contactId: true },
    });
    return prisma.message.findMany({
        where: { contactId: sub.contactId, template: "AUTOPAY_CANCELLED" },
    });
}

describe("telling the customer their autopay was cancelled (D14)", () => {
    const area = env as { SITE_ACCOUNT_AREA?: string };
    afterEach(async () => {
        delete area.SITE_ACCOUNT_AREA;
        await prisma.featureFlag.deleteMany({
            where: { key: "ACCOUNT_THREAD" },
        });
    });

    it("emails them in the business's words through D17's path", async () => {
        const m = await member();
        await activeMandate(m);
        await staff.cancel(owner, m.subscriptionId);
        const [note] = await cancelledNotes(m.subscriptionId);
        expect(note).toMatchObject({
            channel: "EMAIL",
            status: "QUEUED",
            toAddress: m.email,
            subject: "Autopay for Monthly unlimited is off",
            createdByUserId: owner.userId,
        });
        expect(note?.body).toContain(
            "Pulse Fitness has turned off autopay for Monthly unlimited.",
        );
        expect(note?.body).toContain("an invoice with a link to pay it");
        expect(
            await prisma.job.count({
                where: {
                    type: "message.send",
                    payload: { path: ["messageId"], equals: note?.id },
                },
            }),
        ).toBe(1);
    });

    it("a revoked email consent is recorded, not sent, and not claimed", async () => {
        const m = await member();
        await activeMandate(m);
        await prisma.consent.create({
            data: {
                organizationId: owner.organizationId,
                contactId: m.contactId,
                channel: "EMAIL",
                status: "REVOKED",
            },
        });
        const res = await staff.cancel(owner, m.subscriptionId);
        expect(res.told).toEqual({
            email: null,
            suppressed: true,
            account: false,
        });
        const [note] = await cancelledNotes(m.subscriptionId);
        expect(note?.status).toBe("SUPPRESSED");
    });

    it("posts in their account thread only where it is live (ACCOUNT_THREAD)", async () => {
        const dark = await member();
        await activeMandate(dark);
        area.SITE_ACCOUNT_AREA = "on";
        // The area is on, the thread's rollout flag is not: email only.
        const first = await staff.cancel(owner, dark.subscriptionId);
        expect(first.told?.account).toBe(false);
        expect(
            await prisma.customerThreadMessage.count({
                where: { organizationId: owner.organizationId },
            }),
        ).toBe(0);

        await prisma.featureFlag.create({
            data: { key: "ACCOUNT_THREAD", enabledByDefault: true },
        });
        const m = await member();
        await activeMandate(m);
        const res = await staff.cancel(owner, m.subscriptionId);
        expect(res.told).toEqual({
            email: m.email,
            suppressed: false,
            account: true,
        });
        const post = await prisma.customerThreadMessage.findFirstOrThrow({
            where: {
                organizationId: owner.organizationId,
                event: "AUTOPAY_CANCELLED",
            },
            include: { thread: { select: { contactId: true } } },
        });
        expect(post).toMatchObject({ author: "SYSTEM" });
        expect(post.thread.contactId).toBe(m.contactId);
        expect(post.body).toBe(
            "Pulse Fitness turned off autopay for Monthly unlimited. Nothing more is taken automatically — your next renewal comes as an invoice with a link to pay.",
        );
    });

    it("tells nobody about a set-up they never approved", async () => {
        const m = await member();
        await prisma.paymentMandate.create({
            data: {
                organizationId: owner.organizationId,
                contactId: m.contactId,
                subscriptionId: m.subscriptionId,
                provider: "RAZORPAY",
                status: "PENDING",
                method: "UPI",
                maxAmountCents: 180_000,
            },
        });
        const res = await staff.cancel(owner, m.subscriptionId);
        expect(res.outcome).not.toBe("ALREADY_OFF");
        expect(res.told).toBeNull();
        expect(await cancelledNotes(m.subscriptionId)).toHaveLength(0);
    });

    it("without the business's email provider, still cancels and claims no email", async () => {
        const m = await member();
        await activeMandate(m);
        await prisma.communicationProvider.update({
            where: {
                organizationId_channel: {
                    organizationId: owner.organizationId,
                    channel: "EMAIL",
                },
            },
            data: { status: "DISCONNECTED" },
        });
        try {
            const res = await staff.cancel(owner, m.subscriptionId);
            expect(res).toMatchObject({
                outcome: "CANCELLED",
                told: { email: null, suppressed: false, account: false },
            });
            expect(await cancelledNotes(m.subscriptionId)).toHaveLength(0);
        } finally {
            await prisma.communicationProvider.update({
                where: {
                    organizationId_channel: {
                        organizationId: owner.organizationId,
                        channel: "EMAIL",
                    },
                },
                data: { status: "CONNECTED" },
            });
        }
    });
});

describe("Autopay limit too low (D13's MANDATE_LIMIT_LOW)", () => {
    it("says what it covers and what the renewal is; a new set-up link covers it, and approving it clears it", async () => {
        const m = await member();
        const old = await activeMandate(m, {
            maxAmountCents: 100_000,
            activatedAt: new Date(Date.now() - 60 * 86_400_000),
        });
        // D13 found the ₹1,200 renewal above the ₹1,000 limit.
        await prisma.$transaction((tx) =>
            charges.queueInTx(tx, {
                organizationId: owner.organizationId,
                subscriptionId: m.subscriptionId,
                invoiceId: m.invoiceId,
            }),
        );
        let sub = await subscriptions.get(owner, m.subscriptionId);
        expect(sub.autopayCard?.limitLow).toMatchObject({
            limit: "1000.00",
            amount: "1200.00",
            currency: "INR",
        });

        const link = await staff.sendLink(owner, m.subscriptionId, {
            method: "UPI",
        });
        expect(link.limit).toBe("1800.00");
        const fresh = (await mandatesOf(m.subscriptionId)).find(
            (r) => r.id !== old.id,
        );
        await prisma.$transaction((tx) =>
            applyMandateChangeInTx(tx, owner.organizationId, "RAZORPAY", {
                status: "ACTIVE",
                setupReference: fresh?.setupReference ?? undefined,
                providerMandateId: `token_${next()}`,
                method: "UPI",
                displayHint: "me•••@okicici",
                maxAmountCents: 180_000,
            }),
        );
        sub = await subscriptions.get(owner, m.subscriptionId);
        expect(sub.autopay).toMatchObject({ state: "ON", limit: "1800.00" });
        expect(sub.autopayCard?.limitLow).toBeNull();
        const was = await prisma.paymentMandate.findUniqueOrThrow({
            where: { id: old.id },
        });
        expect(was).toMatchObject({
            status: "CANCELLED",
            cancelReason: "REPLACED",
        });
    });
});
