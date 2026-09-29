/**
 * Autopay set-up end to end with the fake provider (round-2 D11), against a
 * real Postgres: the methods on offer, a set-up (PENDING), and every state
 * a signed webhook moves it to — ACTIVE with its method and hint, PAUSED,
 * resumed, CANCELLED at the provider, FAILED — plus a duplicate delivery,
 * a bad signature, a replacement, a subscription that ended meanwhile, and
 * `refresh` when a webhook never came.
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

import { createHmac } from "node:crypto";

import { UnauthorizedException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { InvoicesService } from "../invoices/invoices.service";
import { MANDATE_CANCEL_TYPE } from "../payments/mandate-cancel-job";
import { MandateSetupService } from "../payments/mandate-setup.service";
import { MandatesService } from "../payments/mandates.service";
import { PaymentsService } from "../payments/payments.service";
import { CashfreeProvider } from "../payments/providers/cashfree.provider";
import {
    FakeMerchantProvider,
    FakeProviderFactory,
} from "../payments/providers/fake.provider";
import { supportsMandates } from "../payments/providers/provider.port";
import { RazorpayProvider } from "../payments/providers/razorpay.provider";
import { SubscriptionsService } from "../subscriptions/subscriptions.service";
import {
    FakeWebhookProvider,
    FakeWebhookProviderFactory,
} from "./providers/fake.webhook";
import { WebhooksService } from "./webhooks.service";

const WEBHOOK_SECRET = "whsec_d11";

const fake = new FakeMerchantProvider("RAZORPAY");
const payments = new PaymentsService(new FakeProviderFactory(fake));
const mandates = new MandatesService(new FakeProviderFactory(fake));
const setups = new MandateSetupService(new FakeProviderFactory(fake));
const webhooks = new WebhooksService(
    new FakeWebhookProviderFactory(new FakeWebhookProvider("RAZORPAY")),
    payments,
);
const subscriptions = new SubscriptionsService(new InvoicesService());

const tag = `${process.pid}-${Date.now()}`;
let n = 0;
const next = () => `${tag}-${++n}`;

let owner: OrganizationContext;
let planId: string;

beforeAll(async () => {
    const user = await prisma.user.create({
        data: { email: `d11-owner-${tag}@x.com` },
    });
    const org = await prisma.organization.create({
        data: { name: "Lotus Yoga", slug: `d11-${tag}` },
    });
    owner = { organizationId: org.id, userId: user.id, role: "OWNER" };
    await payments.connectProvider(owner, {
        provider: "RAZORPAY",
        publicKey: "rzp_test_Public1",
        keyId: "rzp_test_Public1",
        keySecret: "rzp_secret",
        webhookSecret: WEBHOOK_SECRET,
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
    fake.mandateMethodList = ["UPI", "CARD", "EMANDATE"];
    fake.mandateCalls.length = 0;
});

async function member(): Promise<{
    contactId: string;
    subscriptionId: string;
}> {
    const contactId = (
        await prisma.contact.create({
            data: {
                organizationId: owner.organizationId,
                email: `m-${next()}@example.in`,
                firstName: "Asha",
                lastName: "Rao",
                phone: "+919000090000",
            },
        })
    ).id;
    const sub = await subscriptions.subscribe(owner, { contactId, planId });
    return { contactId, subscriptionId: sub.id };
}

async function setUp(subscriptionId: string, method: "UPI" | "CARD" = "UPI") {
    return setups.createSetup({
        organizationId: owner.organizationId,
        subscriptionId,
        method,
        maxAmountCents: 180_000,
    });
}

/** A signed webhook for the fake verifier; each call is a new event. */
function signed(event: Record<string, unknown>) {
    const raw = Buffer.from(
        JSON.stringify({ providerEventId: `evt_${next()}`, ...event }),
    );
    const headers = {
        "x-fake-signature": createHmac("sha256", WEBHOOK_SECRET)
            .update(raw)
            .digest("hex"),
    };
    return { raw, headers };
}

async function webhook(event: Record<string, unknown>) {
    const { raw, headers } = signed(event);
    return webhooks.handle("razorpay", owner.organizationId, raw, headers);
}

/** What the provider's `token.confirmed` says, from the fake's own record. */
async function confirmed(setupReference: string) {
    const setup = fake.authorise(setupReference);
    return webhook({
        eventType: "token.confirmed",
        outcome: "MANDATE",
        mandate: {
            status: "ACTIVE",
            setupReference,
            providerMandateId: setup.providerMandateId,
            providerCustomerId: setup.providerCustomerId,
            method: setup.method,
            displayHint: setup.displayHint,
            maxAmountCents: setup.maxAmountCents,
            expiresAt: setup.expiresAt.toISOString(),
        },
    });
}

const mandateOf = (id: string) =>
    prisma.paymentMandate.findUniqueOrThrow({ where: { id } });

const eventsOf = (subscriptionId: string) =>
    prisma.subscriptionEvent.findMany({
        where: { subscriptionId },
        orderBy: { createdAt: "asc" },
        select: { kind: true, data: true },
    });

describe("what autopay is offered", () => {
    it("every method the account has, never narrowed", async () => {
        expect(await setups.mandateMethods(owner.organizationId)).toEqual([
            {
                provider: "RAZORPAY",
                methods: ["UPI", "CARD", "EMANDATE"],
                checkCents: {},
            },
        ]);
    });

    it("says the ₹1 check each method takes with nothing owed (D12B)", async () => {
        fake.authorisationMinimum.UPI = 100;
        try {
            expect(await setups.mandateMethods(owner.organizationId)).toEqual([
                {
                    provider: "RAZORPAY",
                    methods: ["UPI", "CARD", "EMANDATE"],
                    checkCents: { UPI: 100 },
                },
            ]);
        } finally {
            delete fake.authorisationMinimum.UPI;
        }
    });

    it("an account with none offers no autopay", async () => {
        fake.mandateMethodList = [];
        expect(await setups.mandateMethods(owner.organizationId)).toEqual([]);
    });

    it("a provider that can't answer is left out, not guessed", async () => {
        fake.failNextMandateCall("mandateMethods", "UNKNOWN");
        expect(await setups.mandateMethods(owner.organizationId)).toEqual([]);
    });

    it("Razorpay's adapter takes autopay (D19, behind its flag); Cashfree's doesn't yet", () => {
        expect(supportsMandates(new RazorpayProvider())).toBe(true);
        expect(supportsMandates(new CashfreeProvider())).toBe(false);
        expect(supportsMandates(fake)).toBe(true);
    });
});

describe("set-up", () => {
    it("writes a PENDING mandate and hands back the provider's page", async () => {
        const { subscriptionId, contactId } = await member();
        const view = await setUp(subscriptionId);

        expect(view.authorisationUrl).toMatch(
            /^https:\/\/fake\.provider\.test/,
        );
        expect(view).toMatchObject({
            provider: "RAZORPAY",
            method: "UPI",
            maxAmountCents: 180_000,
            currency: "INR",
        });
        const row = await mandateOf(view.mandateId);
        expect(row).toMatchObject({
            status: "PENDING",
            contactId,
            subscriptionId,
            method: "UPI",
            maxAmountCents: 180_000,
            frequency: "AS_PRESENTED",
            setupReference: `fake_setup_${view.mandateId}`,
            providerCustomerId: `fake_cust_${view.mandateId}`,
            providerMandateId: null,
        });
        // The provider was asked with the row's id and the customer's details.
        const call = fake.mandateCalls.find((c) => c.op === "createSetup");
        expect(call?.input).toMatchObject({
            reference: view.mandateId,
            method: "UPI",
            customer: {
                name: "Asha Rao",
                email: expect.stringMatching(/@example\.in$/) as unknown,
            },
        });
    });

    it("refuses a method the account doesn't offer, and writes nothing", async () => {
        const { subscriptionId } = await member();
        fake.mandateMethodList = ["UPI"];
        await expect(setUp(subscriptionId, "CARD")).rejects.toThrow(
            /isn't available for autopay/,
        );
        expect(
            await prisma.paymentMandate.count({ where: { subscriptionId } }),
        ).toBe(0);
    });

    it("refuses a cancelled subscription", async () => {
        const { subscriptionId } = await member();
        await prisma.customerSubscription.update({
            where: { id: subscriptionId },
            data: { status: "CANCELLED" },
        });
        await expect(setUp(subscriptionId)).rejects.toThrow(/has ended/);
    });

    it("refuses a limit above what the provider allows", async () => {
        const { subscriptionId } = await member();
        await expect(
            setups.createSetup({
                organizationId: owner.organizationId,
                subscriptionId,
                method: "UPI",
                maxAmountCents: 10_000_000,
            }),
        ).rejects.toThrow(/limit/);
    });

    it("a refusal or no answer leaves a FAILED row the customer never saw", async () => {
        const { subscriptionId } = await member();
        fake.failNextMandateCall("createSetup", "REFUSED");
        await expect(setUp(subscriptionId)).rejects.toThrow(/didn't accept/);
        fake.failNextMandateCall("createSetup", "UNKNOWN");
        await expect(setUp(subscriptionId)).rejects.toThrow(/didn't answer/);
        const rows = await prisma.paymentMandate.findMany({
            where: { subscriptionId },
            orderBy: { createdAt: "asc" },
        });
        expect(rows.map((r) => [r.status, r.failureReason])).toEqual([
            ["FAILED", "SETUP_REFUSED"],
            ["FAILED", "SETUP_UNANSWERED"],
        ]);
    });

    it("another business's subscription is not found", async () => {
        const other = await prisma.organization.create({
            data: { name: "Elsewhere", slug: `d11-other-${tag}` },
        });
        const { subscriptionId } = await member();
        await expect(
            setups.createSetup({
                organizationId: other.id,
                subscriptionId,
                method: "UPI",
                maxAmountCents: 180_000,
            }),
        ).rejects.toThrow(/not found/);
    });
});

describe("webhooks move a mandate", () => {
    it("authorised → ACTIVE, with the method and a masked hint; logged once", async () => {
        const { subscriptionId } = await member();
        const view = await setUp(subscriptionId);
        const setupReference = `fake_setup_${view.mandateId}`;

        expect(await confirmed(setupReference)).toEqual({
            status: "processed",
            changed: true,
        });
        const row = await mandateOf(view.mandateId);
        expect(row).toMatchObject({
            status: "ACTIVE",
            providerMandateId: `fake_token_${view.mandateId}`,
            method: "UPI",
            displayHint: "as•••@okbank",
            maxAmountCents: 180_000,
        });
        expect(row.activatedAt).toBeInstanceOf(Date);
        expect(row.expiresAt).toBeInstanceOf(Date);
        expect(
            (await eventsOf(subscriptionId)).filter(
                (e) => e.kind === "MANDATE_SET_UP",
            ),
        ).toEqual([{ kind: "MANDATE_SET_UP", data: { method: "UPI" } }]);
    });

    it("a duplicate delivery moves it once", async () => {
        const { subscriptionId } = await member();
        const view = await setUp(subscriptionId);
        const setup = fake.authorise(`fake_setup_${view.mandateId}`);
        const { raw, headers } = signed({
            eventType: "token.confirmed",
            outcome: "MANDATE",
            mandate: {
                status: "ACTIVE",
                setupReference: setup.setupReference,
                providerMandateId: setup.providerMandateId,
            },
        });
        await webhooks.handle("razorpay", owner.organizationId, raw, headers);
        expect(
            await webhooks.handle(
                "razorpay",
                owner.organizationId,
                raw,
                headers,
            ),
        ).toEqual({ status: "duplicate", changed: false });
        expect(
            (await eventsOf(subscriptionId)).filter(
                (e) => e.kind === "MANDATE_SET_UP",
            ),
        ).toHaveLength(1);
    });

    it("a bad signature is refused and writes nothing", async () => {
        const { subscriptionId } = await member();
        const view = await setUp(subscriptionId);
        const { raw } = signed({
            eventType: "token.confirmed",
            outcome: "MANDATE",
            mandate: {
                status: "ACTIVE",
                setupReference: `fake_setup_${view.mandateId}`,
                providerMandateId: "token_forged",
            },
        });
        const before = await prisma.webhookEvent.count();
        await expect(
            webhooks.handle("razorpay", owner.organizationId, raw, {
                "x-fake-signature": "00".repeat(32),
            }),
        ).rejects.toBeInstanceOf(UnauthorizedException);
        expect(await prisma.webhookEvent.count()).toBe(before);
        expect((await mandateOf(view.mandateId)).status).toBe("PENDING");
    });

    it("a full UPI id in a payload is never kept as the hint", async () => {
        const { subscriptionId } = await member();
        const view = await setUp(subscriptionId);
        await webhook({
            eventType: "token.confirmed",
            outcome: "MANDATE",
            mandate: {
                status: "ACTIVE",
                setupReference: `fake_setup_${view.mandateId}`,
                providerMandateId: `tok_${next()}`,
                displayHint: "asha.rao@okbank",
            },
        });
        const row = await mandateOf(view.mandateId);
        expect(row.status).toBe("ACTIVE");
        expect(row.displayHint).toBeNull();
    });

    it("rejected → FAILED with a sanitised reason; never revived", async () => {
        const { subscriptionId } = await member();
        const view = await setUp(subscriptionId);
        const setupReference = `fake_setup_${view.mandateId}`;
        await webhook({
            eventType: "token.rejected",
            outcome: "MANDATE",
            mandate: {
                status: "FAILED",
                setupReference,
                failureReason: "Customer <script> declined",
            },
        });
        let row = await mandateOf(view.mandateId);
        expect(row).toMatchObject({
            status: "FAILED",
            failureReason: "UNKNOWN",
        });

        expect(await confirmed(setupReference)).toEqual({
            status: "ignored",
            changed: false,
        });
        row = await mandateOf(view.mandateId);
        expect(row.status).toBe("FAILED");
    });

    it("paused in the UPI app, then resumed", async () => {
        const { subscriptionId } = await member();
        const view = await setUp(subscriptionId);
        await confirmed(`fake_setup_${view.mandateId}`);
        const token = `fake_token_${view.mandateId}`;

        await webhook({
            eventType: "token.paused",
            outcome: "MANDATE",
            mandate: { status: "PAUSED", providerMandateId: token },
        });
        let row = await mandateOf(view.mandateId);
        expect(row.status).toBe("PAUSED");
        expect(row.pausedAt).toBeInstanceOf(Date);

        await webhook({
            eventType: "token.confirmed",
            outcome: "MANDATE",
            mandate: { status: "ACTIVE", providerMandateId: token },
        });
        row = await mandateOf(view.mandateId);
        expect(row.status).toBe("ACTIVE");
        expect(row.pausedAt).toBeNull();
        // Resuming isn't a second set-up.
        expect(
            (await eventsOf(subscriptionId)).filter(
                (e) => e.kind === "MANDATE_SET_UP",
            ),
        ).toHaveLength(1);
    });

    it("cancelled at the provider → CANCELLED and confirmed, logged", async () => {
        const { subscriptionId } = await member();
        const view = await setUp(subscriptionId);
        await confirmed(`fake_setup_${view.mandateId}`);
        await webhook({
            eventType: "token.cancelled",
            outcome: "MANDATE",
            mandate: {
                status: "CANCELLED",
                providerMandateId: `fake_token_${view.mandateId}`,
            },
        });
        const row = await mandateOf(view.mandateId);
        expect(row).toMatchObject({
            status: "CANCELLED",
            cancelReason: "PROVIDER",
        });
        expect(row.cancelConfirmedAt).toBeInstanceOf(Date);
        expect(
            (await eventsOf(subscriptionId)).find(
                (e) => e.kind === "MANDATE_CANCELLED",
            ),
        ).toEqual({ kind: "MANDATE_CANCELLED", data: { reason: "PROVIDER" } });
    });

    it("Saroh's own cancel is confirmed by the provider's webhook", async () => {
        const { subscriptionId } = await member();
        const view = await setUp(subscriptionId);
        await confirmed(`fake_setup_${view.mandateId}`);
        fake.failNextMandateCancel("UNKNOWN");
        const result = await mandates.cancelFor(
            { organizationId: owner.organizationId, subscriptionId },
            "STAFF",
        );
        expect(result.unconfirmed).toBe(1);
        expect((await mandateOf(view.mandateId)).cancelConfirmedAt).toBeNull();

        await webhook({
            eventType: "token.cancelled",
            outcome: "MANDATE",
            mandate: {
                status: "CANCELLED",
                providerMandateId: `fake_token_${view.mandateId}`,
            },
        });
        const row = await mandateOf(view.mandateId);
        expect(row).toMatchObject({
            status: "CANCELLED",
            cancelReason: "STAFF",
        });
        expect(row.cancelConfirmedAt).toBeInstanceOf(Date);
    });

    it("an unknown mandate is acknowledged, nothing written", async () => {
        expect(
            await webhook({
                eventType: "token.confirmed",
                outcome: "MANDATE",
                mandate: {
                    status: "ACTIVE",
                    providerMandateId: "token_nobody",
                },
            }),
        ).toEqual({ status: "ignored", changed: false });
    });
});

describe("one ACTIVE mandate per subscription", () => {
    it("a new authorisation replaces the old only after cancelling it", async () => {
        const { subscriptionId } = await member();
        const first = await setUp(subscriptionId);
        await confirmed(`fake_setup_${first.mandateId}`);
        const second = await setUp(subscriptionId, "CARD");
        // Both wait side by side: the old one still charges until then.
        expect((await mandateOf(first.mandateId)).status).toBe("ACTIVE");
        expect((await mandateOf(second.mandateId)).status).toBe("PENDING");

        await confirmed(`fake_setup_${second.mandateId}`);
        const [old, now] = await Promise.all([
            mandateOf(first.mandateId),
            mandateOf(second.mandateId),
        ]);
        expect(old).toMatchObject({
            status: "CANCELLED",
            cancelReason: "REPLACED",
            cancelConfirmedAt: null,
        });
        expect(now).toMatchObject({
            status: "ACTIVE",
            method: "CARD",
            displayHint: "•••• 4242",
        });
        // The provider is asked to cancel the old one.
        expect(
            await prisma.job.count({
                where: {
                    organizationId: owner.organizationId,
                    type: MANDATE_CANCEL_TYPE,
                    payload: { equals: { subscriptionId } },
                },
            }),
        ).toBe(1);
    });

    it("the index refuses a second ACTIVE row", async () => {
        const { subscriptionId } = await member();
        const first = await setUp(subscriptionId);
        await confirmed(`fake_setup_${first.mandateId}`);
        const second = await setUp(subscriptionId);
        await expect(
            prisma.paymentMandate.update({
                where: { id: second.mandateId },
                data: { status: "ACTIVE" },
            }),
        ).rejects.toThrow();
    });

    it("authorised after the subscription ended → cancelled straight away", async () => {
        const { subscriptionId } = await member();
        const view = await setUp(subscriptionId);
        await prisma.customerSubscription.update({
            where: { id: subscriptionId },
            data: { status: "CANCELLED" },
        });
        await confirmed(`fake_setup_${view.mandateId}`);
        expect(await mandateOf(view.mandateId)).toMatchObject({
            status: "CANCELLED",
            cancelReason: "SUBSCRIPTION_ENDED",
            providerMandateId: `fake_token_${view.mandateId}`,
            cancelConfirmedAt: null,
        });
    });
});

describe("refresh, when a webhook never came", () => {
    it("reads the provider and applies what it says", async () => {
        const { subscriptionId } = await member();
        const view = await setUp(subscriptionId);
        fake.authorise(`fake_setup_${view.mandateId}`);
        expect(
            await setups.refresh(owner.organizationId, view.mandateId),
        ).toEqual({ status: "ACTIVE", applied: true });
        expect(
            await setups.refresh(owner.organizationId, view.mandateId),
        ).toEqual({ status: "ACTIVE", applied: false });
    });

    it("a provider that can't answer leaves it as it was", async () => {
        const { subscriptionId } = await member();
        const view = await setUp(subscriptionId);
        fake.failNextMandateCall("get", "UNKNOWN");
        expect(
            await setups.refresh(owner.organizationId, view.mandateId),
        ).toEqual({ status: "PENDING", applied: false });
    });
});
