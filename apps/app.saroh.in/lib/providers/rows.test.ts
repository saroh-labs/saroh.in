import { afterEach, describe, expect, it, vi } from "vitest";

import type { ProviderHealth } from "@/lib/provider-health/service";

import type { ProviderRowsInput } from "./rows";
import {
    buildProvidersView,
    dashboardFor,
    needsPublicKey,
    paymentsConsequence,
    RAZORPAY_KEY_ID,
    stripeKeyProblems,
} from "./rows";

// Which edition this is (DEC-204): its profile lists the payment providers.
const edition = vi.hoisted((): { name: "INDIA" | "GLOBAL" } => ({
    name: "INDIA",
}));
vi.mock("@/lib/edition", async (actual) => {
    const { editionProfile } = await import("@saroh/edition");
    return {
        ...(await actual<object>()),
        get PROFILE() {
            return editionProfile(edition.name);
        },
    };
});
afterEach(() => {
    edition.name = "INDIA";
});

describe("disconnecting a payment provider (#921)", () => {
    it("warns that its customers' autopay memberships there aren't cancelled", () => {
        expect(
            paymentsConsequence({ provider: "RAZORPAY", activeMemberships: 4 }),
        ).toMatch(
            /^Checkout stops taking online payments.* Disconnecting stops Saroh syncing with Razorpay\. It doesn't cancel your customers' autopay memberships there \(4 are active\)\. Cancel them in your Razorpay dashboard if you want them stopped\.$/,
        );
        // None active, or an older API: the count sentence is left out.
        expect(paymentsConsequence({ provider: "CASHFREE" })).toContain(
            "autopay memberships there. Cancel them in your Cashfree dashboard",
        );
    });
});

describe("Razorpay key id check", () => {
    it("takes a test or live key id and nothing else", () => {
        expect(RAZORPAY_KEY_ID.test("rzp_live_AbC123")).toBe(true);
        expect(RAZORPAY_KEY_ID.test("rzp_test_AbC123")).toBe(true);
        for (const wrong of [
            "AbC123",
            "rzp_prod_AbC123",
            "rzp_live_",
            "rzp_live_Ab C",
            "secret_rzp_live_A",
        ]) {
            expect(RAZORPAY_KEY_ID.test(wrong)).toBe(false);
        }
    });
});

const HEALTH: ProviderHealth[] = [
    {
        key: "PAYMENTS",
        label: "Payments",
        status: "NOT_CONFIGURED",
        message: "Connect a payment provider to accept payments.",
        actionHref: "/settings/providers",
    },
    {
        key: "COMMUNICATIONS",
        label: "Communications",
        status: "NOT_CONFIGURED",
        message: "Connect a provider to send messages.",
        actionHref: "/settings/providers",
    },
    {
        key: "DOMAINS",
        label: "Domains",
        status: "NOT_CONFIGURED",
        message:
            "No custom domain connected. You're using a saroh.app web address.",
        actionHref: "/sites",
    },
];

function input(over: Partial<ProviderRowsInput> = {}): ProviderRowsInput {
    return {
        health: HEALTH,
        payments: [],
        messaging: [],
        domains: [],
        checkout: [],
        ...over,
    };
}

const pay = (
    provider: "RAZORPAY" | "CASHFREE" | "STRIPE",
    status = "CONNECTED",
    publicKey: string | null = null,
) => ({ id: provider, provider, status, publicKey, updatedAt: "" });

const comms = (
    channel: "EMAIL" | "WHATSAPP",
    provider: string,
    status = "CONNECTED",
    fromAddress: string | null = null,
) => ({ id: provider, channel, provider, status, fromAddress, updatedAt: "" });

const names = (list: { name: string }[]) => list.map((e) => e.name);

describe("provider rows", () => {
    it("offers every provider the API can connect before anything is set up", () => {
        const view = buildProvidersView(input());
        expect(view.connected).toEqual([]);
        expect(names(view.available)).toEqual([
            "Razorpay",
            "Cashfree",
            "Resend",
            "SendGrid",
            "SMTP relay",
            "Meta (WhatsApp Cloud)",
            "Twilio",
        ]);
        expect(view.available.every((e) => e.state === "NOT_CONNECTED")).toBe(
            true,
        );
        expect(view.available.every((e) => e.manageHref === null)).toBe(true);
    });

    it("never offers a provider the API cannot connect", () => {
        const all = names(buildProvidersView(input()).available);
        expect(all).not.toContain("Dodo Payments");
        expect(all).not.toContain("Stripe");
    });

    it("groups each provider by itself, connected first, the rest available", () => {
        const view = buildProvidersView(
            input({
                payments: [pay("CASHFREE", "CONNECTED", "cf_live_abc")],
                messaging: [
                    comms("EMAIL", "RESEND", "CONNECTED", "hi@nw.example"),
                ],
                checkout: [
                    { name: "Northwind Supply Store", provider: "CASHFREE" },
                    { name: "Pop-up", provider: null },
                ],
            }),
        );
        expect(view.connected.map((e) => [e.name, e.type, e.state])).toEqual([
            ["Cashfree", "Payments", "CONNECTED"],
            ["Resend", "Email", "CONNECTED"],
        ]);
        // Email sends through one provider at a time, so another email
        // provider would replace Resend — that is its Change keys, not a
        // second Connect.
        expect(names(view.available)).toEqual([
            "Razorpay",
            "Meta (WhatsApp Cloud)",
            "Twilio",
        ]);

        const [cashfree, resend] = view.connected;
        expect(cashfree.note).toBe(
            "Takes online payments at Northwind Supply Store.",
        );
        expect(cashfree.refs).toEqual([
            { label: "Public key", code: "cf_live_abc" },
        ]);
        expect(cashfree.manageHref).toBe("https://merchant.cashfree.com");
        expect(cashfree.target).toEqual({
            kind: "payments",
            provider: "CASHFREE",
        });
        expect(cashfree.setup).toEqual({
            kind: "payments",
            provider: "CASHFREE",
        });
        expect(cashfree.consequence).toMatch(
            /^Checkout stops taking online payments/,
        );

        expect(resend.note).toBe("Email to your customers and leads.");
        expect(resend.refs).toEqual([
            { label: "Sends from", code: "hi@nw.example" },
        ]);
        expect(resend.manageHref).toBe("https://resend.com/emails");
        expect(resend.target).toEqual({ kind: "messaging", channel: "EMAIL" });
        expect(resend.consequence).toMatch(/^Email stops being sent/);
    });

    it("opens Connect on the provider the row names", () => {
        const view = buildProvidersView(input());
        const twilio = view.available.find((e) => e.name === "Twilio");
        expect(twilio?.setup).toEqual({
            kind: "messaging",
            channel: "WHATSAPP",
            provider: "TWILIO",
        });
    });

    it("keeps a provider someone disconnected under Connected, not Available", () => {
        const view = buildProvidersView(
            input({
                payments: [pay("CASHFREE", "DISABLED", "cf_live_abc")],
                messaging: [comms("WHATSAPP", "META", "DISABLED")],
            }),
        );
        const [cashfree, meta] = view.connected;
        expect(cashfree.name).toBe("Cashfree");
        expect(cashfree.state).toBe("DISCONNECTED");
        expect(cashfree.note).toMatch(/^Disconnected/);
        // Nothing to manage or take away, and no key to show.
        expect(cashfree.manageHref).toBeNull();
        expect(cashfree.target).toBeNull();
        expect(cashfree.refs).toEqual([]);
        expect(meta.state).toBe("DISCONNECTED");

        const all = names(view.available);
        expect(all).not.toContain("Cashfree");
        expect(all).not.toContain("Meta (WhatsApp Cloud)");
        // With nothing live on WhatsApp, the other provider can be connected.
        expect(all).toContain("Twilio");
    });

    it("names the storefronts that charge through each payment provider", () => {
        const view = buildProvidersView(
            input({
                payments: [
                    pay("RAZORPAY", "CONNECTED", "rzp_live_Rye1"),
                    pay("CASHFREE"),
                ],
                checkout: [{ name: "Rye & Co.", provider: "RAZORPAY" }],
            }),
        );
        const [razorpay, cashfree] = view.connected;
        expect(razorpay.note).toBe("Takes online payments at Rye & Co.");
        expect(cashfree.note).toMatch(/No location's checkout uses it yet/);
        expect(view.available.some((e) => e.type === "Payments")).toBe(false);
    });

    it("says a Razorpay connection without its public key id needs attention (DEC-054)", () => {
        for (const publicKey of [null, "", "  "]) {
            const view = buildProvidersView(
                input({
                    payments: [pay("RAZORPAY", "CONNECTED", publicKey)],
                    checkout: [{ name: "Rye & Co.", provider: "RAZORPAY" }],
                }),
            );
            const [razorpay] = view.connected;
            expect(razorpay.state).toBe("ATTENTION");
            expect(razorpay.note).toMatch(/^Needs its key id/);
            expect(razorpay.refs).toEqual([]);
            // Still theirs: it can be managed, disconnected, and its keys
            // entered again in the setup dialog opened on Razorpay.
            expect(razorpay.manageHref).toBe("https://dashboard.razorpay.com");
            expect(razorpay.target).toEqual({
                kind: "payments",
                provider: "RAZORPAY",
            });
            expect(razorpay.setup).toEqual({
                kind: "payments",
                provider: "RAZORPAY",
            });
            expect(view.available.map((e) => e.name)).not.toContain("Razorpay");
        }
    });

    it("says a Razorpay connection without its webhook signing secret needs attention (DEC-063)", () => {
        const view = buildProvidersView(
            input({
                payments: [
                    {
                        ...pay("RAZORPAY", "CONNECTED", "rzp_live_A1"),
                        webhookSecretMissing: true,
                    },
                ],
            }),
        );
        const [razorpay] = view.connected;
        expect(razorpay.state).toBe("ATTENTION");
        expect(razorpay.note).toBe(
            "Needs its webhook signing secret. Payments can't be confirmed until you add it.",
        );
        expect(razorpay.fix).toBe("Add webhook secret");
        // The same setup dialog, opened on Razorpay, is the fix.
        expect(razorpay.setup).toEqual({
            kind: "payments",
            provider: "RAZORPAY",
        });
    });

    it("asks for the key id first when both are missing, and nothing of a healthy one", () => {
        const both = buildProvidersView(
            input({
                payments: [
                    {
                        ...pay("RAZORPAY", "CONNECTED", null),
                        webhookSecretMissing: true,
                    },
                ],
            }),
        ).connected[0];
        expect(both.fix).toBe("Add key id");
        expect(both.note).toMatch(/^Needs its key id/);

        const healthy = buildProvidersView(
            input({
                payments: [
                    {
                        ...pay("RAZORPAY", "CONNECTED", "rzp_live_A1"),
                        webhookSecretMissing: false,
                    },
                ],
            }),
        ).connected[0];
        expect(healthy.state).toBe("CONNECTED");
        expect(healthy.fix).toBeNull();

        // A disconnected one is not flagged — nothing is taken through it.
        const off = buildProvidersView(
            input({
                payments: [
                    {
                        ...pay("RAZORPAY", "DISABLED", "rzp_live_A1"),
                        webhookSecretMissing: true,
                    },
                ],
            }),
        ).connected[0];
        expect(off.state).toBe("DISCONNECTED");
    });

    it("says when a payment update last arrived, or that none has (DEC-063)", () => {
        const now = new Date("2026-09-29T10:00:00Z");
        const hook = (
            provider: "RAZORPAY" | "CASHFREE",
            lastReceivedAt: string | null,
        ) => ({
            provider,
            url: `https://api.saroh.in/public/webhooks/${provider.toLowerCase()}/org_1`,
            events: [],
            secretRequired: provider === "RAZORPAY",
            lastReceivedAt,
        });
        const view = buildProvidersView(
            input({
                payments: [
                    pay("RAZORPAY", "CONNECTED", "rzp_live_A1"),
                    pay("CASHFREE"),
                ],
                webhooks: [
                    hook("RAZORPAY", "2026-09-29T09:58:00Z"),
                    hook("CASHFREE", null),
                ],
                now,
            }),
        );
        expect(view.connected.map((e) => e.update)).toEqual([
            "Last payment update from Razorpay: 2 minutes ago.",
            "No payment updates received yet. Check the webhook in Cashfree.",
        ]);

        // Unread: nothing is claimed either way.
        const unread = buildProvidersView(
            input({ payments: [pay("CASHFREE")], webhooks: null, now }),
        );
        expect(unread.connected[0].update).toBeNull();
    });

    it("never asks a Cashfree or a disconnected Razorpay connection for a public key", () => {
        const view = buildProvidersView(
            input({
                payments: [pay("RAZORPAY", "DISABLED"), pay("CASHFREE")],
            }),
        );
        expect(view.connected.map((e) => [e.name, e.state])).toEqual([
            ["Razorpay", "DISCONNECTED"],
            ["Cashfree", "CONNECTED"],
        ]);
    });

    it("reads a Razorpay connection with its public key as connected, and shows the key", () => {
        const view = buildProvidersView(
            input({ payments: [pay("RAZORPAY", "CONNECTED", "rzp_live_A1")] }),
        );
        const [razorpay] = view.connected;
        expect(razorpay.state).toBe("CONNECTED");
        expect(razorpay.refs).toEqual([
            { label: "Public key", code: "rzp_live_A1" },
        ]);
    });

    it("gives an SMTP relay Disconnect but no Manage", () => {
        const view = buildProvidersView(
            input({ messaging: [comms("EMAIL", "SMTP")] }),
        );
        const smtp = view.connected[0];
        expect(smtp.name).toBe("SMTP relay");
        expect(smtp.manageHref).toBeNull();
        expect(smtp.target).toEqual({ kind: "messaging", channel: "EMAIL" });
    });

    it("says what it could not read rather than offering or denying it", () => {
        const view = buildProvidersView(
            input({ payments: null, messaging: null }),
        );
        expect(view.unread).toEqual(["payments", "messaging"]);
        expect(view.connected).toEqual([]);
        expect(view.available).toEqual([]);
    });

    it("lists only the kinds a module that is on uses", () => {
        const view = buildProvidersView(
            input({ health: HEALTH.filter((h) => h.key !== "PAYMENTS") }),
        );
        expect(view.available.some((e) => e.type === "Payments")).toBe(false);
        expect(view.available.length).toBeGreaterThan(0);
    });

    it("lists domains by hostname and sends their fixes to Sites", () => {
        const health = HEALTH.map((h) =>
            h.key === "DOMAINS"
                ? {
                      ...h,
                      status: "PENDING" as const,
                      message: "A domain is awaiting DNS verification.",
                  }
                : h,
        );
        const dom = buildProvidersView(
            input({
                health,
                domains: [{ hostname: "rye.example", status: "PENDING" }],
            }),
        ).domains;
        expect(dom?.state).toBe("PENDING");
        expect(dom?.refs).toEqual([
            { label: "Waiting for DNS", code: "rye.example" },
        ]);
        expect(dom?.setup).toEqual({ href: "/sites", label: "Check DNS" });
    });

    it("knows only real dashboards", () => {
        expect(dashboardFor("stripe")).toBe("https://dashboard.stripe.com");
        expect(dashboardFor("SMTP")).toBeNull();
    });
});

describe("no Saroh-sent booking emails (DEC-086 removed, #1134)", () => {
    it("a disconnected email provider's row says only that email stops", () => {
        const view = buildProvidersView(
            input({ messaging: [comms("EMAIL", "RESEND", "DISABLED")] }),
        );
        const [resend] = view.connected;
        expect(resend.state).toBe("DISCONNECTED");
        expect(resend.note).toBe(
            "Disconnected. Email isn't sent until a provider is connected again.",
        );
        // Connect still jumps to another provider.
        expect(view.connectEmailKey).toBe("EMAIL:SENDGRID");
    });

    it("warns before disconnecting that email stops, never that Saroh takes over", () => {
        const [resend] = buildProvidersView(
            input({ messaging: [comms("EMAIL", "RESEND")] }),
        ).connected;
        expect(resend.consequence).toMatch(
            /^Email stops being sent straight away/,
        );
        expect(resend.consequence).not.toMatch(/Saroh/);
    });

    it("has nothing to show with no module that uses a provider", () => {
        const view = buildProvidersView(input({ health: [] }));
        expect(view.any).toBe(false);
        expect(view.connectEmailKey).toBeNull();
        expect(view).not.toHaveProperty("bookingEmails");
    });
});

describe("Stripe, on Global only", () => {
    it("Global offers Stripe and no Indian provider", () => {
        edition.name = "GLOBAL";
        const view = buildProvidersView(input());
        const all = names(view.available);
        expect(all).toContain("Stripe");
        expect(all).not.toContain("Razorpay");
        expect(all).not.toContain("Cashfree");
    });

    it("India never offers Stripe", () => {
        expect(names(buildProvidersView(input()).available)).not.toContain(
            "Stripe",
        );
    });

    it("a Stripe connection without its publishable key needs attention", () => {
        edition.name = "GLOBAL";
        const row = pay("STRIPE", "CONNECTED", null);
        expect(needsPublicKey(row)).toBe(true);
        expect(needsPublicKey({ ...row, publicKey: "pk_live_example" })).toBe(
            false,
        );
        const [entry] = buildProvidersView(
            input({ payments: [row] }),
        ).connected;
        expect(entry.state).toBe("ATTENTION");
        expect(entry.fix).toBe("Add publishable key");
        expect(entry.note).toMatch(/^Needs its publishable key\. /);
    });
});

describe("stripeKeyProblems", () => {
    const ok = {
        publishable: "pk_test_example",
        restricted: "rk_test_example",
        webhookSecret: "whsec_example",
    };

    it("takes a matching pair and a signing secret", () => {
        expect(stripeKeyProblems(ok, true)).toEqual({});
        expect(
            stripeKeyProblems(
                {
                    ...ok,
                    publishable: "pk_live_example",
                    restricted: " rk_live_example ",
                },
                true,
            ),
        ).toEqual({});
    });

    it("says nothing of an empty key until the button is pressed", () => {
        const empty = { publishable: "", restricted: "", webhookSecret: "" };
        expect(stripeKeyProblems(empty, false)).toEqual({});
        expect(stripeKeyProblems(empty, true)).toEqual({
            publishable:
                "Enter the publishable key. It starts pk_live_ or pk_test_.",
            restricted:
                "Enter the restricted key. It starts rk_live_ or rk_test_.",
            webhookSecret:
                "Enter the webhook signing secret. It starts whsec_.",
        });
    });

    it("says what each key should start with", () => {
        expect(
            stripeKeyProblems(
                {
                    publishable: "rk_test_example",
                    restricted: "pk_test_example",
                    webhookSecret: "example",
                },
                false,
            ),
        ).toEqual({
            publishable:
                "That isn't a publishable key. It starts pk_live_ or pk_test_.",
            restricted:
                "That isn't a restricted key. It starts rk_live_ or rk_test_.",
            webhookSecret:
                "That isn't a webhook signing secret. It starts whsec_.",
        });
    });

    it("turns away a full secret key", () => {
        expect(
            stripeKeyProblems({ ...ok, restricted: "sk_live_example" }, false)
                .restricted,
        ).toBe(
            "Use a restricted key, not your secret key. In Stripe, create one with Payment Intents and Refunds set to Write.",
        );
    });

    it("wants both keys in the same mode", () => {
        expect(
            stripeKeyProblems({ ...ok, restricted: "rk_live_example" }, false)
                .restricted,
        ).toBe(
            "The publishable key is a test key and the restricted key is a live key. Use two test keys or two live keys.",
        );
    });
});
