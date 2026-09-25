import { describe, expect, it } from "vitest";

import type { ProviderHealth } from "@/lib/provider-health/service";

import type { ProviderRowsInput } from "./rows";
import { buildProvidersView, dashboardFor } from "./rows";

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
        message: "No custom domain connected — you're using a Saroh subdomain.",
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
    provider: "RAZORPAY" | "CASHFREE",
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
            "Takes card and UPI payments at Northwind Supply Store.",
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
        expect(cashfree.consequence).toMatch(/^Checkout stops taking card/);

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
                payments: [pay("RAZORPAY"), pay("CASHFREE")],
                checkout: [{ name: "Rye & Co.", provider: "RAZORPAY" }],
            }),
        );
        const [razorpay, cashfree] = view.connected;
        expect(razorpay.note).toBe("Takes card and UPI payments at Rye & Co.");
        expect(cashfree.note).toMatch(/no storefront's checkout uses it yet/);
        expect(view.available.some((e) => e.type === "Payments")).toBe(false);
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
