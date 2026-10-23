// Network-free unit tests for the billing provider adapters + factory (S7-005).
// No @saroh/database and no HTTP: these assert the CREDENTIAL BOUNDARY — the
// adapters read ONLY Saroh's own `SAROH_*` platform env keys (never a merchant
// credential) — plus the real HMAC verify paths and factory resolution.
import { createHmac } from "node:crypto";

import { NotFoundException } from "@nestjs/common";

import { BillingProviderError } from "./billing-provider.port";
import { CashfreeBillingProvider } from "./cashfree.provider";
import { FakeBillingProvider } from "./fake.provider";
import { DefaultBillingProviderFactory } from "./provider.factory";
import { RazorpayBillingProvider, retryAfterMs } from "./razorpay.provider";

/** Wrap `process.env` in a proxy that records every string key read. */
function recordEnvReads(): { reads: string[]; restore: () => void } {
    const reads: string[] = [];
    const real = globalThis.process.env;
    globalThis.process.env = new Proxy(real, {
        get(target, prop, receiver) {
            if (typeof prop === "string") reads.push(prop);
            return Reflect.get(target, prop, receiver) as unknown;
        },
    });
    return { reads, restore: () => (globalThis.process.env = real) };
}

const RZP_WEBHOOK_SECRET = "SAROH_RAZORPAY_WEBHOOK_SECRET";
const CF_WEBHOOK_SECRET = "SAROH_CASHFREE_WEBHOOK_SECRET";

describe("RazorpayBillingProvider.verifyWebhook", () => {
    afterEach(() => {
        delete globalThis.process.env[RZP_WEBHOOK_SECRET];
    });

    it("accepts a valid HMAC and reads ONLY its own SAROH_RAZORPAY_* env key", () => {
        globalThis.process.env[RZP_WEBHOOK_SECRET] = "platform_whsec";
        const provider = new RazorpayBillingProvider();
        const raw = Buffer.from(
            JSON.stringify({ event: "subscription.charged" }),
        );
        const signature = createHmac("sha256", "platform_whsec")
            .update(raw)
            .digest("hex");

        const { reads, restore } = recordEnvReads();
        const ok = provider.verifyWebhook(raw, {
            "x-razorpay-signature": signature,
        });
        restore();

        expect(ok).toBe(true);
        // Credential separation: every env read is a platform Razorpay key —
        // never a merchant credential (PAYMENTS_ENC_KEY, merchant provider keys).
        expect(reads.length).toBeGreaterThan(0);
        for (const key of reads) {
            expect(key.startsWith("SAROH_RAZORPAY_")).toBe(true);
        }
        expect(reads).toContain(RZP_WEBHOOK_SECRET);
    });

    it("rejects a forged signature and an absent header", () => {
        globalThis.process.env[RZP_WEBHOOK_SECRET] = "platform_whsec";
        const provider = new RazorpayBillingProvider();
        const raw = Buffer.from("{}");

        expect(
            provider.verifyWebhook(raw, {
                "x-razorpay-signature": createHmac("sha256", "wrong")
                    .update(raw)
                    .digest("hex"),
            }),
        ).toBe(false);
        expect(provider.verifyWebhook(raw, {})).toBe(false);
    });

    it("fails closed (false, no throw) when the platform secret is unset", () => {
        const provider = new RazorpayBillingProvider();
        const raw = Buffer.from("{}");
        expect(
            provider.verifyWebhook(raw, { "x-razorpay-signature": "deadbeef" }),
        ).toBe(false);
    });

    it("parses a subscription event to a normalized shape", () => {
        const provider = new RazorpayBillingProvider();
        const event = provider.parseWebhook({
            event: "subscription.halted",
            payload: {
                subscription: { entity: { id: "sub_x", status: "halted" } },
            },
        });
        expect(event).toEqual({
            type: "subscription.halted",
            providerEventId: "subscription.halted:sub_x:unknown",
            providerSubscriptionId: "sub_x",
            status: "PAST_DUE",
            phase: "halted",
            eventAt: null,
        });
    });

    it("gives each delivery its own event id, so next month's charge is not a duplicate (PAY-04)", () => {
        const provider = new RazorpayBillingProvider();
        const charged = (created_at: number, id?: string) =>
            provider.parseWebhook(
                {
                    event: "subscription.charged",
                    created_at,
                    payload: { subscription: { entity: { id: "sub_x" } } },
                },
                id ? { "x-razorpay-event-id": id } : {},
            ).providerEventId;

        // Razorpay's delivery id when it sends one; the same id twice is
        // still one event.
        expect(charged(1, "evt_A")).toBe("evt_A");
        expect(charged(2, "evt_A")).toBe("evt_A");
        // Without it, the event's own time tells two charges apart.
        expect(charged(1_790_000_000)).not.toBe(charged(1_792_600_000));
    });
});

describe("CashfreeBillingProvider.parseWebhook (PAY-04)", () => {
    it("tells two status changes of one subscription apart", () => {
        const provider = new CashfreeBillingProvider();
        const id = (event_time: string, subscription_status: string) =>
            provider.parseWebhook({
                type: "SUBSCRIPTION_STATUS_WEBHOOK",
                event_time,
                data: { cf_subscription_id: 7, subscription_status },
            }).providerEventId;
        expect(id("2026-10-01T00:00:00Z", "ON_HOLD")).not.toBe(
            id("2026-10-03T00:00:00Z", "ACTIVE"),
        );
        // A redelivery of the same event is still a duplicate.
        expect(id("2026-10-01T00:00:00Z", "ON_HOLD")).toBe(
            id("2026-10-01T00:00:00Z", "ON_HOLD"),
        );
    });
});

describe("CashfreeBillingProvider.verifyWebhook", () => {
    afterEach(() => {
        delete globalThis.process.env[CF_WEBHOOK_SECRET];
    });

    it("accepts a valid base64 HMAC over timestamp+body, reading ONLY its SAROH_CASHFREE_* key", () => {
        globalThis.process.env[CF_WEBHOOK_SECRET] = "cf_platform_whsec";
        const provider = new CashfreeBillingProvider();
        const raw = Buffer.from(
            JSON.stringify({ type: "SUBSCRIPTION_STATUS_WEBHOOK" }),
        );
        const timestamp = "1700000000";
        const signed = Buffer.concat([Buffer.from(timestamp, "utf8"), raw]);
        const signature = createHmac("sha256", "cf_platform_whsec")
            .update(signed)
            .digest("base64");

        const { reads, restore } = recordEnvReads();
        const ok = provider.verifyWebhook(raw, {
            "x-webhook-signature": signature,
            "x-webhook-timestamp": timestamp,
        });
        restore();

        expect(ok).toBe(true);
        for (const key of reads) {
            expect(key.startsWith("SAROH_CASHFREE_")).toBe(true);
        }
        expect(reads).toContain(CF_WEBHOOK_SECRET);
    });

    it("rejects when the timestamp header is missing", () => {
        globalThis.process.env[CF_WEBHOOK_SECRET] = "cf_platform_whsec";
        const provider = new CashfreeBillingProvider();
        const raw = Buffer.from("{}");
        expect(
            provider.verifyWebhook(raw, { "x-webhook-signature": "abc" }),
        ).toBe(false);
    });
});

describe("DefaultBillingProviderFactory", () => {
    it("resolves RAZORPAY and CASHFREE case-insensitively", () => {
        const factory = new DefaultBillingProviderFactory();
        expect(factory.get("razorpay").name).toBe("RAZORPAY");
        expect(factory.get("cashfree").name).toBe("CASHFREE");
    });

    it("404s an unknown provider", () => {
        const factory = new DefaultBillingProviderFactory();
        expect(() => factory.get("stripe")).toThrow(NotFoundException);
    });
});

/**
 * The Razorpay calls U15 adds, against a recorded fetch: what is sent and how
 * an answer is classified. Written to Razorpay's published API, not yet run
 * in test mode (the spike's answers are unverified, PRICING_ROLLOUT.md).
 */
describe("RazorpayBillingProvider plans, checkout and cancel (U15)", () => {
    const KEY_ID = "SAROH_RAZORPAY_KEY_ID";
    const KEY_SECRET = "SAROH_RAZORPAY_KEY_SECRET";
    beforeEach(() => {
        globalThis.process.env[KEY_ID] = "rzp_test_platform";
        globalThis.process.env[KEY_SECRET] = "platform_secret";
    });
    afterEach(() => {
        delete globalThis.process.env[KEY_ID];
        delete globalThis.process.env[KEY_SECRET];
    });

    function recorded(
        answers: {
            status: number;
            body?: unknown;
            headers?: Record<string, string>;
        }[],
    ): {
        provider: RazorpayBillingProvider;
        calls: { url: string; method: string; body: unknown }[];
        waits: number[];
    } {
        const provider = new RazorpayBillingProvider();
        const calls: { url: string; method: string; body: unknown }[] = [];
        const waits: number[] = [];
        provider.sleepFn = (ms) => {
            waits.push(ms);
            return Promise.resolve();
        };
        provider.fetchFn = (input, init) => {
            calls.push({
                url: String(input),
                method: init?.method ?? "GET",
                body:
                    typeof init?.body === "string"
                        ? (JSON.parse(init.body) as unknown)
                        : undefined,
            });
            const a = answers.shift() ?? { status: 500 };
            return Promise.resolve(
                new Response(JSON.stringify(a.body ?? {}), {
                    status: a.status,
                    ...(a.headers ? { headers: a.headers } : {}),
                }),
            );
        };
        return { provider, calls, waits };
    }

    it("makes a plan with the amount it is given, per month or year, and Saroh's reference", async () => {
        const { provider, calls } = recorded([
            { status: 200, body: { id: "plan_1" } },
        ]);
        await expect(
            provider.plans.createPlan({
                reference: "ref_1",
                name: "Plan B",
                amountPaise: 26_196,
                currency: "INR",
                period: "year",
            }),
        ).resolves.toEqual({ providerPlanId: "plan_1" });
        expect(calls[0]).toEqual({
            url: "https://api.razorpay.com/v1/plans",
            method: "POST",
            body: {
                period: "yearly",
                interval: 1,
                item: { name: "Plan B", amount: 26_196, currency: "INR" },
                notes: { saroh_ref: "ref_1" },
            },
        });
    });

    const customer = {
        name: "Ammi & Sons Foods Pvt. Ltd.",
        businessName: "Ammi Ki Barni",
        email: "owner@example.com",
        contact: "+91 98000 00000",
        gstin: "27AAPFU0939F1ZV",
        address: {
            line1: "12 Hill Road",
            line2: null,
            city: "Mumbai",
            state: "Maharashtra",
            postalCode: "400050",
        },
        billingProfileId: "bprof_1",
        ownerUserId: "user_1",
        businessSlug: "ammi-ki-barni",
    };

    it("makes the billing profile a Razorpay customer once: name, email, phone, GSTIN; only its ids in the notes", async () => {
        const { provider, calls } = recorded([
            { status: 200, body: { id: "cust_1" } },
        ]);
        await expect(
            provider.customers.createCustomer(customer, { withContact: true }),
        ).resolves.toEqual({ providerCustomerId: "cust_1" });
        expect(calls[0]).toEqual({
            url: "https://api.razorpay.com/v1/customers",
            method: "POST",
            body: {
                name: "Ammi and Sons Foods Pvt. Ltd.",
                email: "owner@example.com",
                contact: "+919800000000",
                gstin: "27AAPFU0939F1ZV",
                fail_existing: "1",
                // Notes are create-only: only what never changes, so the
                // dashboard never shows a stale name, GSTIN or address.
                notes: {
                    billing_profile_id: "bprof_1",
                    saroh_owner: "user_1",
                    saroh_business: "ammi-ki-barni",
                },
            },
        });
    });

    it("answers `exists` when Razorpay has a customer with the same email and phone", async () => {
        const { provider } = recorded([
            {
                status: 400,
                body: {
                    error: {
                        code: "BAD_REQUEST_ERROR",
                        description: "Customer already exists for the merchant",
                    },
                },
            },
        ]);
        await expect(
            provider.customers.createCustomer(customer, { withContact: true }),
        ).resolves.toBe("exists");
    });

    it("any other refusal is REFUSED, keeping only the status", async () => {
        const { provider } = recorded([
            {
                status: 400,
                body: { error: { description: "secret detail" } },
            },
        ]);
        const made = provider.customers.createCustomer(customer, {
            withContact: true,
        });
        await expect(made).rejects.toMatchObject({ kind: "REFUSED" });
        await expect(made).rejects.not.toThrow(/secret detail/);
    });

    it("made without the phone, it sends none", async () => {
        const { provider, calls } = recorded([
            { status: 200, body: { id: "cust_2" } },
        ]);
        await provider.customers.createCustomer(customer, {
            withContact: false,
        });
        expect(calls[0]?.body).not.toHaveProperty("contact");
        expect(
            (calls[0]?.body as { notes: Record<string, string> }).notes,
        ).not.toHaveProperty("phone");
    });

    it("finds the customer Razorpay holds for the same email and phone with fail_existing 0, and whose its notes say it is", async () => {
        const { provider, calls } = recorded([
            {
                status: 200,
                body: {
                    id: "cust_1",
                    notes: { billing_profile_id: "bprof_1", saroh_owner: "u" },
                },
            },
            { status: 200, body: { id: "cust_9", notes: [] } },
            // Made for one business before profiles (DEC-165).
            {
                status: 200,
                body: { id: "cust_5", notes: { organizationId: "org_1" } },
            },
        ]);
        await expect(
            provider.customers.existingCustomer(customer, {
                withContact: true,
            }),
        ).resolves.toEqual({
            providerCustomerId: "cust_1",
            billingProfileId: "bprof_1",
            organizationId: null,
        });
        expect(calls[0]).toMatchObject({
            url: "https://api.razorpay.com/v1/customers",
            method: "POST",
            body: { fail_existing: "0", contact: "+919800000000" },
        });
        // Made by Razorpay itself (no notes: an empty array).
        await expect(
            provider.customers.existingCustomer(customer, {
                withContact: true,
            }),
        ).resolves.toEqual({
            providerCustomerId: "cust_9",
            billingProfileId: null,
            organizationId: null,
        });
        await expect(
            provider.customers.existingCustomer(customer, {
                withContact: true,
            }),
        ).resolves.toEqual({
            providerCustomerId: "cust_5",
            billingProfileId: null,
            organizationId: "org_1",
        });
    });

    it("fetches a customer by id; one Razorpay doesn't have is null", async () => {
        const { provider, calls } = recorded([
            {
                status: 200,
                body: { id: "cust_old", notes: { organizationId: "org_1" } },
            },
            {
                status: 400,
                body: {
                    error: { description: "The id provided does not exist" },
                },
            },
        ]);
        await expect(
            provider.customers.findCustomer("cust_old"),
        ).resolves.toEqual({
            providerCustomerId: "cust_old",
            billingProfileId: null,
            organizationId: "org_1",
        });
        expect(calls[0]).toMatchObject({
            url: "https://api.razorpay.com/v1/customers/cust_old",
            method: "GET",
        });
        await expect(
            provider.customers.findCustomer("cust_gone"),
        ).resolves.toBeNull();
    });

    it("an update to an email and phone another customer has is `exists`; any other 400 is REFUSED", async () => {
        const { provider } = recorded([
            {
                status: 400,
                body: {
                    error: {
                        description: "Customer already exists for the merchant",
                    },
                },
            },
            { status: 400, body: { error: { description: "secret detail" } } },
        ]);
        await expect(
            provider.customers.updateCustomer("cust_1", customer, {
                withContact: true,
            }),
        ).resolves.toBe("exists");
        const refused = provider.customers.updateCustomer("cust_1", customer, {
            withContact: true,
        });
        await expect(refused).rejects.toMatchObject({ kind: "REFUSED" });
        await expect(refused).rejects.not.toThrow(/secret detail/);
    });

    it("brings the customer up to date by PUT: name, email, phone and GSTIN", async () => {
        const { provider, calls } = recorded([
            { status: 200 },
            { status: 200 },
        ]);
        await provider.customers.updateCustomer("cust_1", customer, {
            withContact: true,
        });
        await provider.customers.updateCustomer("cust_1", customer, {
            withContact: false,
        });
        expect(calls[0]).toEqual({
            url: "https://api.razorpay.com/v1/customers/cust_1",
            method: "PUT",
            body: {
                name: "Ammi and Sons Foods Pvt. Ltd.",
                email: "owner@example.com",
                contact: "+919800000000",
                gstin: "27AAPFU0939F1ZV",
            },
        });
        expect(calls[1]?.body).not.toHaveProperty("contact");
    });

    it("leaves out a phone or GSTIN Razorpay would refuse", async () => {
        const { provider, calls } = recorded([
            { status: 200, body: { id: "cust_1" } },
        ]);
        await provider.customers.createCustomer(
            {
                ...customer,
                contact: "12",
                gstin: "not-a-gstin",
                address: null,
            },
            { withContact: true },
        );
        const body = calls[0]?.body as Record<string, unknown>;
        expect(body).not.toHaveProperty("contact");
        expect(body).not.toHaveProperty("gstin");
    });

    it("is configured only where Saroh's key id and secret are set", () => {
        const provider = new RazorpayBillingProvider();
        expect(provider.customers.configured()).toBe(true);
        const secret = globalThis.process.env.SAROH_RAZORPAY_KEY_SECRET;
        delete globalThis.process.env.SAROH_RAZORPAY_KEY_SECRET;
        try {
            expect(provider.customers.configured()).toBe(false);
        } finally {
            globalThis.process.env.SAROH_RAZORPAY_KEY_SECRET = secret;
        }
    });

    it("puts who is billed in a subscription's notes, naming the business and its billing profile", async () => {
        const { provider, calls } = recorded([
            { status: 200, body: { id: "sub_1", status: "created" } },
        ]);
        await provider.createSubscription({
            planKey: "catalog.grow",
            planId: "p1",
            priceCents: 100,
            currency: "INR",
            interval: "month",
            organizationId: "org_1",
            providerPlanId: "plan_1",
            customer: {
                ...customer,
                businessSlug: "ammi-foods",
                billingProfileId: "bp_1",
            },
            providerCustomerId: "cust_1",
        });
        const body = calls[0]?.body as { notes: unknown; customer_id: unknown };
        expect(body.customer_id).toBe("cust_1");
        expect(body.notes).toMatchObject({
            organizationId: "org_1",
            saroh_business: "ammi-foods",
            billing_profile_id: "bp_1",
            billing_name: "Ammi & Sons Foods Pvt. Ltd.",
            gstin: "27AAPFU0939F1ZV",
            billing_address: "12 Hill Road, Mumbai, Maharashtra, 400050",
        });
    });

    it("finds a plan made earlier by its reference, page by page", async () => {
        const full = Array.from({ length: 100 }, (_, i) => ({
            id: `plan_x${i}`,
            notes: {},
        }));
        const { provider, calls } = recorded([
            { status: 200, body: { items: full } },
            {
                status: 200,
                body: {
                    items: [{ id: "plan_7", notes: { saroh_ref: "ref_7" } }],
                },
            },
        ]);
        await expect(provider.plans.findPlan("ref_7")).resolves.toBe("plan_7");
        expect(calls.map((c) => c.url)).toEqual([
            "https://api.razorpay.com/v1/plans?count=100&skip=0",
            "https://api.razorpay.com/v1/plans?count=100&skip=100",
        ]);
    });

    it("makes a subscription on the provider plan, starting later with the difference up front", async () => {
        const startAt = new Date("2026-04-01T00:00:00Z");
        const { provider, calls } = recorded([
            {
                status: 200,
                body: {
                    id: "sub_9",
                    status: "created",
                    short_url: "https://rzp.io/i/x",
                },
            },
        ]);
        const made = await provider.createSubscription({
            planKey: "catalog.b",
            planId: "row_b",
            priceCents: 22_200,
            currency: "INR",
            interval: "month",
            organizationId: "org_1",
            providerPlanId: "plan_b",
            startAt,
            upfront: {
                name: "Plan B: the rest of this period",
                amountPaise: 4_678,
            },
            reference: "chk_1",
        });
        expect(made).toMatchObject({
            providerSubscriptionId: "sub_9",
            authorisationUrl: "https://rzp.io/i/x",
        });
        expect(calls[0]?.body).toEqual({
            plan_id: "plan_b",
            total_count: 120,
            quantity: 1,
            customer_notify: 1,
            start_at: startAt.getTime() / 1000,
            addons: [
                {
                    item: {
                        name: "Plan B: the rest of this period",
                        amount: 4_678,
                        currency: "INR",
                    },
                },
            ],
            notes: {
                sarohPlanKey: "catalog.b",
                organizationId: "org_1",
                saroh_ref: "chk_1",
            },
        });
    });

    it("makes a subscription for the term it's told: 12 charges (DEC-093)", async () => {
        const { provider, calls } = recorded([
            { status: 200, body: { id: "sub_12", status: "created" } },
        ]);
        await provider.createSubscription({
            planKey: "catalog.b",
            planId: "row_b",
            priceCents: 22_200,
            currency: "INR",
            interval: "month",
            organizationId: "org_1",
            providerPlanId: "plan_b",
            totalCount: 12,
        });
        expect(calls[0]?.body).toMatchObject({ total_count: 12 });
    });

    it("links a subscription to the business's customer when it has one", async () => {
        const { provider, calls } = recorded([
            { status: 200, body: { id: "sub_c", status: "created" } },
            { status: 200, body: { id: "sub_n", status: "created" } },
        ]);
        const input = {
            planKey: "catalog.b",
            planId: "row_b",
            priceCents: 22_200,
            currency: "INR",
            interval: "month" as const,
            organizationId: "org_1",
            providerPlanId: "plan_b",
        };
        await provider.createSubscription({
            ...input,
            providerCustomerId: "cust_1",
        });
        await provider.createSubscription(input);
        expect(calls[0]?.body).toMatchObject({ customer_id: "cust_1" });
        expect(calls[1]?.body).not.toHaveProperty("customer_id");
    });

    it("makes a yearly plan's one payment as an order for the amount given (DEC-093)", async () => {
        const { provider, calls } = recorded([
            { status: 200, body: { id: "order_1" } },
        ]);
        await expect(
            provider.orders.createOrder({
                amountPaise: 261_960,
                currency: "INR",
                reference: "chk_year",
                organizationId: "org_1",
                planKey: "catalog.b",
            }),
        ).resolves.toEqual({ providerOrderId: "order_1" });
        expect(calls[0]).toEqual({
            url: "https://api.razorpay.com/v1/orders",
            method: "POST",
            body: {
                amount: 261_960,
                currency: "INR",
                receipt: "chk_year",
                notes: {
                    sarohPlanKey: "catalog.b",
                    organizationId: "org_1",
                    saroh_ref: "chk_year",
                },
            },
        });
    });

    it("reads how a subscription stands as the event its webhook would send", async () => {
        const end = 1_790_000_000;
        const { provider, calls } = recorded([
            { status: 200, body: { status: "created" } },
            { status: 200, body: { status: "authenticated" } },
            { status: 200, body: { items: [] } },
            {
                status: 200,
                body: {
                    status: "active",
                    paid_count: 1,
                    current_end: end,
                    customer_id: "cust_1",
                },
            },
            {
                status: 200,
                body: {
                    items: [
                        { status: "issued", payment_id: null },
                        { status: "paid", payment_id: "pay_2" },
                        { status: "paid", payment_id: "pay_1" },
                    ],
                },
            },
            { status: 200, body: { status: "cancelled" } },
        ]);
        const ask = () => provider.statuses.checkoutStatus("sub_1", false);
        await expect(ask()).resolves.toEqual({
            phase: "other",
            status: "IGNORED",
        });
        await expect(ask()).resolves.toEqual({
            phase: "authenticated",
            status: "IGNORED",
            providerPaymentId: null,
        });
        // A subscription names no payment: its latest paid invoice does.
        await expect(ask()).resolves.toEqual({
            phase: "charged",
            status: "ACTIVE",
            currentPeriodEnd: new Date(end * 1000),
            providerCustomerId: "cust_1",
            providerPaymentId: "pay_2",
        });
        await expect(ask()).resolves.toEqual({
            phase: "cancelled",
            status: "CANCELLED",
        });
        expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
            "GET https://api.razorpay.com/v1/subscriptions/sub_1",
            "GET https://api.razorpay.com/v1/subscriptions/sub_1",
            "GET https://api.razorpay.com/v1/invoices?subscription_id=sub_1",
            "GET https://api.razorpay.com/v1/subscriptions/sub_1",
            "GET https://api.razorpay.com/v1/invoices?subscription_id=sub_1",
            "GET https://api.razorpay.com/v1/subscriptions/sub_1",
        ]);
    });

    it("still answers how a subscription stands when its invoices can't be read", async () => {
        const { provider } = recorded([
            { status: 200, body: { status: "active", paid_count: 1 } },
            { status: 503 },
        ]);
        await expect(
            provider.statuses.checkoutStatus("sub_1", false),
        ).resolves.toMatchObject({ phase: "charged", providerPaymentId: null });
    });

    it("puts Saroh's ids on a payment's notes, keeping the ones it had, at most 15", async () => {
        const had = Object.fromEntries(
            Array.from({ length: 14 }, (_, i) => [`k${i}`, `v${i}`]),
        );
        const { provider, calls } = recorded([
            { status: 200, body: { id: "pay_1", notes: had } },
            { status: 200, body: { id: "pay_1" } },
        ]);
        await provider.paymentNotes.setPaymentNotes({
            providerPaymentId: "pay_1",
            notes: {
                saroh_invoice: "SA/26-27/0005",
                organizationId: "org_1",
                saroh_checkout: "chk_1",
            },
        });
        expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
            "GET https://api.razorpay.com/v1/payments/pay_1",
            "PATCH https://api.razorpay.com/v1/payments/pay_1",
        ]);
        const sent = (calls[1]!.body as { notes: Record<string, string> })
            .notes;
        expect(Object.keys(sent)).toHaveLength(15);
        expect(sent).toMatchObject({
            k0: "v0",
            saroh_invoice: "SA/26-27/0005",
            organizationId: "org_1",
            saroh_checkout: "chk_1",
        });
    });

    it("refunds a payment in full, once: one already refunded answers with its refund", async () => {
        const { provider, calls } = recorded([
            { status: 200, body: { amount: 118_000, amount_refunded: 0 } },
            { status: 200, body: { id: "rfnd_1", amount: 118_000 } },
            {
                status: 200,
                body: { amount: 118_000, amount_refunded: 118_000 },
            },
            { status: 200, body: { items: [{ id: "rfnd_1" }] } },
        ]);
        const input = { providerPaymentId: "pay_1", reference: "refund:pay_1" };
        await expect(provider.refunds.refundPayment(input)).resolves.toEqual({
            providerRefundId: "rfnd_1",
            amountPaise: 118_000,
        });
        await expect(provider.refunds.refundPayment(input)).resolves.toEqual({
            providerRefundId: "rfnd_1",
            amountPaise: 118_000,
        });
        expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
            "GET https://api.razorpay.com/v1/payments/pay_1",
            "POST https://api.razorpay.com/v1/payments/pay_1/refund",
            "GET https://api.razorpay.com/v1/payments/pay_1",
            "GET https://api.razorpay.com/v1/payments/pay_1/refunds",
        ]);
        // The whole payment: no amount sent.
        expect(calls[1]!.body).toEqual({
            speed: "normal",
            receipt: "refund:pay_1",
            notes: { saroh_ref: "refund:pay_1" },
        });
    });

    it("names the business, its subscription and why in the refund's notes", async () => {
        const { provider, calls } = recorded([
            { status: 200, body: { amount: 118_000, amount_refunded: 0 } },
            { status: 200, body: { id: "rfnd_1", amount: 118_000 } },
        ]);
        await provider.refunds.refundPayment({
            providerPaymentId: "pay_1",
            reference: "refund:pay_1",
            organizationId: "org_1",
            providerSubscriptionId: "sub_1",
            reason: "double_charge",
        });
        expect(calls[1]?.body).toMatchObject({
            notes: {
                saroh_ref: "refund:pay_1",
                organizationId: "org_1",
                saroh_subscription: "sub_1",
                saroh_reason: "double_charge",
            },
        });
    });

    it("a refund Razorpay refuses (4xx) is REFUSED with Razorpay's own words; a 5xx is UNKNOWN", async () => {
        const { provider } = recorded([
            { status: 200, body: { amount: 118_000, amount_refunded: 0 } },
            {
                status: 400,
                body: {
                    error: {
                        code: "BAD_REQUEST_ERROR",
                        description: "invalid request sent",
                    },
                },
            },
            { status: 200, body: { amount: 118_000, amount_refunded: 0 } },
            { status: 502 },
        ]);
        const input = { providerPaymentId: "pay_1", reference: "refund:pay_1" };
        const refused = await provider.refunds
            .refundPayment(input)
            .catch((e: unknown) => e);
        expect(refused).toBeInstanceOf(BillingProviderError);
        expect(refused).toMatchObject({
            kind: "REFUSED",
            said: "invalid request sent",
            message:
                "Razorpay payment refund failed (HTTP 400): invalid request sent",
        });
        await expect(
            provider.refunds.refundPayment(input),
        ).rejects.toMatchObject({ kind: "UNKNOWN" });
    });

    it("reads the customer a webhook's subscription or payment bills", () => {
        const provider = new RazorpayBillingProvider();
        expect(
            provider.parseWebhook({
                event: "subscription.charged",
                payload: {
                    subscription: {
                        entity: { id: "sub_1", customer_id: "cust_1" },
                    },
                    payment: { entity: { id: "pay_1" } },
                },
            }),
        ).toMatchObject({ providerCustomerId: "cust_1" });
        expect(
            provider.parseWebhook({
                event: "order.paid",
                payload: {
                    order: { entity: { id: "order_1" } },
                    payment: { entity: { id: "pay_1", customer_id: "cust_2" } },
                },
            }),
        ).toMatchObject({ providerCustomerId: "cust_2" });
    });

    it("reads an order as paid only once Razorpay says so, with the payment that paid it", async () => {
        const { provider, calls } = recorded([
            { status: 200, body: { status: "attempted" } },
            { status: 200, body: { status: "paid" } },
            {
                status: 200,
                body: {
                    items: [
                        { id: "pay_failed", status: "failed" },
                        { id: "pay_ok", status: "captured" },
                    ],
                },
            },
        ]);
        await expect(
            provider.statuses.checkoutStatus("order_1", true),
        ).resolves.toEqual({ phase: "other", status: "IGNORED" });
        await expect(
            provider.statuses.checkoutStatus("order_1", true),
        ).resolves.toEqual({
            phase: "charged",
            status: "ACTIVE",
            providerPaymentId: "pay_ok",
        });
        expect(calls.map((c) => c.url)).toEqual([
            "https://api.razorpay.com/v1/orders/order_1",
            "https://api.razorpay.com/v1/orders/order_1",
            "https://api.razorpay.com/v1/orders/order_1/payments",
        ]);
    });

    it("has nothing to cancel for an order, and asks Razorpay nothing", async () => {
        const { provider, calls } = recorded([]);
        await provider.cancelSubscription("order_1", { atCycleEnd: false });
        expect(calls).toHaveLength(0);
    });

    it("reads order.paid as the charge of the order it names", () => {
        const provider = new RazorpayBillingProvider();
        expect(
            provider.parseWebhook(
                {
                    event: "order.paid",
                    created_at: 1_790_000_000,
                    payload: {
                        order: { entity: { id: "order_1" } },
                        payment: { entity: { id: "pay_1", amount: 118000 } },
                    },
                },
                { "x-razorpay-event-id": "evt_o1" },
            ),
        ).toMatchObject({
            providerEventId: "evt_o1",
            providerSubscriptionId: "order_1",
            status: "ACTIVE",
            phase: "charged",
            providerPaymentId: "pay_1",
            paymentAmountPaise: 118000,
        });
    });

    it("gives Checkout its key id, the public half, and nothing else", () => {
        expect(new RazorpayBillingProvider().publicKey()).toBe(
            "rzp_test_platform",
        );
    });

    it("tells Razorpay until when a subscription may be authorised (expire_by)", async () => {
        const { provider, calls } = recorded([
            { status: 200, body: { id: "sub_x", status: "created" } },
        ]);
        const expireBy = new Date("2026-10-18T10:00:00Z");
        await provider.createSubscription({
            planKey: "catalog.grow",
            planId: "p1",
            priceCents: 100,
            currency: "INR",
            interval: "month",
            organizationId: "org_1",
            providerPlanId: "plan_1",
            expireBy,
        });
        expect(calls[0]!.body).toMatchObject({
            expire_by: Math.floor(expireBy.getTime() / 1000),
        });
    });

    it("reads where a subscription stands when a cancel is refused", async () => {
        const { provider } = recorded(
            [
                "created",
                "authenticated",
                "pending",
                "halted",
                "cancelled",
                "expired",
                "completed",
            ]
                .map((status) => ({ status: 200, body: { status } }))
                .concat([
                    {
                        status: 200,
                        body: { status: "active", remaining_count: 3 },
                    } as never,
                    {
                        status: 200,
                        body: { status: "active", remaining_count: 0 },
                    } as never,
                ]),
        );
        const ask = () => provider.statuses.subscriptionStanding("sub_1");
        const seen = [];
        for (let i = 0; i < 9; i++) seen.push(await ask());
        expect(seen).toEqual([
            "created",
            "authorised",
            "failing",
            "failing",
            "ended",
            "ended",
            "ended",
            "running",
            "last-cycle",
        ]);
    });

    it("cancels at the cycle's end unless told now", async () => {
        const { provider, calls } = recorded([
            { status: 200 },
            { status: 200 },
        ]);
        await provider.cancelSubscription("sub_1");
        await provider.cancelSubscription("sub_1", { atCycleEnd: false });
        expect(calls.map((c) => c.body)).toEqual([
            { cancel_at_cycle_end: 1 },
            { cancel_at_cycle_end: 0 },
        ]);
    });

    it("asks again after a 429's Retry-After, within bounds", async () => {
        const { provider, calls, waits } = recorded([
            { status: 429, headers: { "Retry-After": "3" } },
            { status: 429, headers: { "Retry-After": "600" } },
            { status: 200, body: { id: "plan_1" } },
        ]);
        await expect(
            provider.plans.createPlan({
                reference: "r",
                name: "n",
                amountPaise: 1,
                currency: "INR",
                period: "month",
            }),
        ).resolves.toEqual({ providerPlanId: "plan_1" });
        expect(calls).toHaveLength(3);
        // 3 s as asked; 10 minutes is capped at 10 s.
        expect(waits).toEqual([3_000, 10_000]);
        expect(retryAfterMs(null)).toBe(2_000);
        expect(
            retryAfterMs(
                new Date(Date.UTC(2026, 9, 17, 0, 0, 5)).toUTCString(),
                Date.UTC(2026, 9, 17),
            ),
        ).toBe(5_000);
    });

    it("classifies a 4xx as REFUSED and a 5xx or 429 as UNKNOWN, keeping only the status", async () => {
        const { provider } = recorded([
            { status: 400, body: { error: { description: "secret detail" } } },
            { status: 503 },
            // Still rate limited after asking twice more.
            { status: 429 },
            { status: 429 },
            { status: 429 },
        ]);
        const plan = {
            reference: "r",
            name: "n",
            amountPaise: 1,
            currency: "INR",
            period: "month" as const,
        };
        for (const kind of ["REFUSED", "UNKNOWN", "UNKNOWN"]) {
            const error = await provider.plans
                .createPlan(plan)
                .catch((e: unknown) => e);
            expect(error).toBeInstanceOf(BillingProviderError);
            expect((error as BillingProviderError).kind).toBe(kind);
            expect((error as Error).message).not.toContain("secret detail");
        }
    });

    it("refuses a coupon without a Razorpay offer rather than charge the full amount, asking nothing", async () => {
        const { provider, calls } = recorded([]);
        const error = await provider
            .createSubscription({
                planKey: "catalog.b",
                planId: "row_b",
                priceCents: 22_200,
                currency: "INR",
                interval: "month",
                organizationId: "org_1",
                providerPlanId: "plan_b",
                discount: { code: "TEST-OFF", amountPaise: 131, charges: 2 },
            })
            .catch((e: unknown) => e);
        expect(error).toBeInstanceOf(BillingProviderError);
        expect((error as BillingProviderError).kind).toBe("REFUSED");
        expect(calls).toHaveLength(0);
    });

    it("passes a coupon's Razorpay offer as offer_id when making the subscription", async () => {
        const { provider, calls } = recorded([
            { status: 200, body: { id: "sub_10", status: "created" } },
        ]);
        await provider.createSubscription({
            planKey: "catalog.b",
            planId: "row_b",
            priceCents: 22_200,
            currency: "INR",
            interval: "month",
            organizationId: "org_1",
            providerPlanId: "plan_b",
            discount: {
                code: "TEST-OFF",
                amountPaise: 131,
                charges: 2,
                razorpayOfferId: "offer_ABCDEFGHIJKLMN",
            },
            reference: "chk_2",
        });
        expect(calls).toHaveLength(1);
        expect(calls[0]?.body).toMatchObject({
            plan_id: "plan_b",
            offer_id: "offer_ABCDEFGHIJKLMN",
        });
    });

    it("sends no offer_id without a coupon", async () => {
        const { provider, calls } = recorded([
            { status: 200, body: { id: "sub_11", status: "created" } },
        ]);
        await provider.createSubscription({
            planKey: "catalog.b",
            planId: "row_b",
            priceCents: 22_200,
            currency: "INR",
            interval: "month",
            organizationId: "org_1",
            providerPlanId: "plan_b",
            discount: null,
        });
        expect(calls[0]?.body).not.toHaveProperty("offer_id");
    });

    it("puts an item on a subscription's next charge, GST included, with Saroh's reference (U16)", async () => {
        const { provider, calls } = recorded([
            { status: 200, body: { items: [] } },
            { status: 200, body: { id: "ao_1" } },
        ]);
        await expect(
            provider.charges.addToNextCharge({
                providerSubscriptionId: "sub_9",
                reference: "row_1",
                name: "More things (add-on)",
                amountPaise: 262,
                currency: "INR",
            }),
        ).resolves.toEqual({ providerChargeId: "ao_1" });
        expect(calls[0]?.url).toBe(
            "https://api.razorpay.com/v1/addons?count=100&skip=0",
        );
        expect(calls[1]).toEqual({
            url: "https://api.razorpay.com/v1/subscriptions/sub_9/addons",
            method: "POST",
            body: {
                item: {
                    name: "More things (add-on)",
                    amount: 262,
                    currency: "INR",
                    description: "saroh_ref:row_1",
                },
                quantity: 1,
            },
        });
    });

    it("never adds an item twice: a repeat finds the add-on already made under its reference (U16)", async () => {
        const { provider, calls } = recorded([
            {
                status: 200,
                body: {
                    items: [
                        // Another subscription's item with the same reference
                        // text, and this one's other item: neither is it.
                        {
                            id: "ao_other_sub",
                            subscription_id: "sub_8",
                            item: { description: "saroh_ref:row_1" },
                        },
                        {
                            id: "ao_other_row",
                            subscription_id: "sub_9",
                            item: { description: "saroh_ref:row_2" },
                        },
                        {
                            id: "ao_made",
                            subscription_id: "sub_9",
                            item: { description: "saroh_ref:row_1" },
                        },
                    ],
                },
            },
        ]);
        await expect(
            provider.charges.addToNextCharge({
                providerSubscriptionId: "sub_9",
                reference: "row_1",
                name: "More things (add-on)",
                amountPaise: 262,
                currency: "INR",
            }),
        ).resolves.toEqual({ providerChargeId: "ao_made" });
        expect(calls.map((c) => c.method)).toEqual(["GET"]);
    });

    it("reads when an event happened, its phase and the period it paid to", () => {
        const event = new RazorpayBillingProvider().parseWebhook({
            event: "subscription.charged",
            created_at: 1_775_000_000,
            payload: {
                subscription: {
                    entity: { id: "sub_x", current_end: 1_777_600_000 },
                },
            },
        });
        expect(event).toMatchObject({
            status: "ACTIVE",
            phase: "charged",
            eventAt: new Date(1_775_000_000 * 1000),
            currentPeriodEnd: new Date(1_777_600_000 * 1000),
        });
    });
});

describe("coupons and Razorpay Offers", () => {
    const input = (razorpayOfferId?: string | null) => ({
        planKey: "catalog.b",
        planId: "row_b",
        priceCents: 22_200,
        currency: "INR",
        interval: "month",
        organizationId: "org_1",
        providerPlanId: "plan_b",
        discount: {
            code: "TEST-OFF",
            amountPaise: 131,
            charges: 2,
            razorpayOfferId,
        },
        reference: "chk_3",
    });

    it("the fake, like Razorpay, refuses a coupon without an offer and keeps the offer it is given", async () => {
        const fake = new FakeBillingProvider();
        const error = await fake
            .createSubscription(input(null))
            .catch((e: unknown) => e);
        expect((error as BillingProviderError).kind).toBe("REFUSED");
        expect(fake.createCalls).toHaveLength(0);

        await fake.createSubscription(input("offer_ABCDEFGHIJKLMN"));
        expect(fake.createCalls[0]?.discount?.razorpayOfferId).toBe(
            "offer_ABCDEFGHIJKLMN",
        );
    });

    it("Cashfree refuses a coupon, asking nothing, even with an offer", async () => {
        const fetchSpy = jest.spyOn(globalThis, "fetch");
        try {
            const error = await new CashfreeBillingProvider()
                .createSubscription(input("offer_ABCDEFGHIJKLMN"))
                .catch((e: unknown) => e);
            expect(error).toBeInstanceOf(BillingProviderError);
            expect((error as BillingProviderError).kind).toBe("REFUSED");
            expect(fetchSpy).not.toHaveBeenCalled();
        } finally {
            fetchSpy.mockRestore();
        }
    });
});
