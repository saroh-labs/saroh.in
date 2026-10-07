import { describe, expect, it } from "vitest";

import type { ProviderHealth } from "@/lib/provider-health/service";

import { CONTACT_EMAIL_HREF } from "./booking-emails";
import type { ProviderRowsInput } from "./rows";
import { buildProvidersView, dashboardFor, RAZORPAY_KEY_ID } from "./rows";
import type { SarohEmailState } from "./service";

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
        expect(cashfree.note).toMatch(/no location's checkout uses it yet/);
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
            "Needs its webhook signing secret — payments can't be confirmed until you add it.",
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
            "Last payment update from Razorpay: 2 min ago.",
            "No payment updates received yet — check the webhook in Cashfree.",
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

describe("booking emails Saroh sends (DEC-086)", () => {
    const sending = (
        over: Partial<{
            state: "SENDING" | "NEAR" | "PAUSED";
            used: number;
            replyTo: string | null;
            canConnectOwn: boolean | null;
        }> = {},
    ): SarohEmailState => ({
        state: over.state ?? "SENDING",
        used: over.used ?? 3,
        cap: 10,
        resetsOn: "1 Nov",
        sender: {
            name: "Rye Studio via Saroh",
            address: "bookings@notify.saroh.in",
        },
        replyTo:
            over.replyTo === undefined ? "hello@rye.example" : over.replyTo,
        canConnectOwn:
            over.canConnectOwn === undefined ? true : over.canConnectOwn,
    });
    const block = (view: ReturnType<typeof buildProvidersView>) => {
        const b = view.bookingEmails;
        if (b?.kind !== "block") throw new Error(`no block: ${b?.kind}`);
        return b.block;
    };

    it("says Saroh sends them, the month's count, the sender, where replies go, and jumps to an email provider", () => {
        const view = buildProvidersView(input({ sarohEmail: sending() }));
        const b = block(view);
        expect(b.status).toBe("Saroh sends your booking emails for now");
        expect(b.usage).toBe("3 of 10 this month · starts again 1 Nov");
        expect(b.sender).toBe(
            '"Rye Studio via Saroh" <bookings@notify.saroh.in>',
        );
        expect(b.replyTo).toBe("hello@rye.example");
        expect(b.noReply).toBeNull();
        expect(b.body).toContain("Connect your own email");
        // Connect goes to the first email provider on offer.
        expect(view.connectEmailKey).toBe("EMAIL:RESEND");
        // Never in Connected: Saroh is not a provider the business added.
        expect(view.connected).toEqual([]);
    });

    it("asks for a contact email when replies have nowhere to go", () => {
        const b = block(
            buildProvidersView(
                input({ sarohEmail: sending({ replyTo: null }) }),
            ),
        );
        expect(b.replyTo).toBeNull();
        expect(b.noReply).toMatch(/Add a contact email/);
        expect(CONTACT_EMAIL_HREF).toBe(
            "/settings/organization?section=contact",
        );
    });

    it("warns near the allowance with the day it starts again", () => {
        const b = block(
            buildProvidersView(
                input({ sarohEmail: sending({ state: "NEAR", used: 8 }) }),
            ),
        );
        expect(b.tone).toBe("near");
        expect(b.usage).toBe("8 of 10 this month · starts again 1 Nov");
        expect(b.body).toContain(
            "At 10, Saroh stops sending them until 1 Nov.",
        );
    });

    it("says paused until the month starts again at the allowance", () => {
        const b = block(
            buildProvidersView(
                input({ sarohEmail: sending({ state: "PAUSED", used: 10 }) }),
            ),
        );
        expect(b.tone).toBe("paused");
        expect(b.status).toBe("Paused until 1 Nov");
        expect(b.body).toContain("in their account on your site");
    });

    describe("when its plan has no room to connect its own email (DEC-086)", () => {
        const higher =
            "A higher plan lets you connect your own email, and then they go through it with no monthly limit.";

        it("offers connecting when it can", () => {
            const b = block(
                buildProvidersView(input({ sarohEmail: sending() })),
            );
            expect(b.own).toBe("connect");
            expect(b.body).toBe(
                "Confirmed, moved and cancelled bookings, counted against your plan. Connect your own email and they go through it, with no monthly limit.",
            );
        });

        it("offers seeing plans instead, in every state, and never Connect", () => {
            const words = {
                SENDING: `Confirmed, moved and cancelled bookings, counted against your plan. ${higher}`,
                NEAR: `At 10, Saroh stops sending them until 1 Nov. ${higher}`,
                PAUSED: `Saroh has sent all 10 booking emails your plan includes this month. Customers still see each booking update in their account on your site. ${higher}`,
            } as const;
            for (const [state, body] of Object.entries(words)) {
                const b = block(
                    buildProvidersView(
                        input({
                            sarohEmail: sending({
                                state: state as keyof typeof words,
                                used:
                                    state === "SENDING"
                                        ? 3
                                        : state === "NEAR"
                                          ? 8
                                          : 10,
                                canConnectOwn: false,
                            }),
                        }),
                    ),
                );
                expect(b.own).toBe("upgrade");
                expect(b.body).toBe(body);
                expect(b.body).not.toMatch(/Connect your own email/);
            }
        });

        it("claims neither when that couldn't be read", () => {
            const b = block(
                buildProvidersView(
                    input({ sarohEmail: sending({ canConnectOwn: null }) }),
                ),
            );
            expect(b.own).toBe("unread");
            expect(b.body).toMatch(
                /We couldn't read whether your plan lets you connect your own email\./,
            );
        });

        it("offers connecting, as before, from an API that predates the field", () => {
            const old: SarohEmailState = { ...sending() };
            delete (old as { canConnectOwn?: boolean | null }).canConnectOwn;
            expect(
                block(buildProvidersView(input({ sarohEmail: old }))).own,
            ).toBe("connect");
        });
    });

    it("names what it couldn't read, and never shows a zero", () => {
        const view = buildProvidersView(
            input({ sarohEmail: { state: "UNREAD" } }),
        );
        expect(view.bookingEmails?.kind).toBe("unread");
        const text =
            view.bookingEmails?.kind === "unread"
                ? view.bookingEmails.text
                : "";
        expect(text).toMatch(/^Booking emails: we couldn't read/);
        expect(text).not.toMatch(/\b0 of\b/);
    });

    it("shows nothing new when Saroh doesn't send them", () => {
        for (const sarohEmail of [
            { state: "OFF", takesOver: false } as const,
            null,
            undefined,
        ]) {
            const view = buildProvidersView(input({ sarohEmail }));
            expect(view.bookingEmails).toBeNull();
            expect(view).toEqual(buildProvidersView(input()));
        }
    });

    it("tells a disconnected email provider's row that Saroh sends booking emails now", () => {
        const view = buildProvidersView(
            input({
                messaging: [comms("EMAIL", "RESEND", "DISABLED")],
                sarohEmail: sending(),
            }),
        );
        const [resend] = view.connected;
        expect(resend.state).toBe("DISCONNECTED");
        expect(resend.note).toBe(
            "Disconnected — Saroh sends your booking emails for now, counted against your plan; other email isn't sent until a provider is connected again.",
        );
        // The block still shows, and Connect jumps to another provider.
        expect(view.bookingEmails?.kind).toBe("block");
        expect(view.connectEmailKey).toBe("EMAIL:SENDGRID");

        const paused = buildProvidersView(
            input({
                messaging: [comms("EMAIL", "RESEND", "DISABLED")],
                sarohEmail: sending({ state: "PAUSED", used: 10 }),
            }),
        ).connected[0];
        expect(paused.note).toContain("paused until 1 Nov");

        const off = buildProvidersView(
            input({ messaging: [comms("EMAIL", "RESEND", "DISABLED")] }),
        ).connected[0];
        expect(off.note).toBe(
            "Disconnected — email isn't sent until a provider is connected again.",
        );
    });

    it("warns before disconnecting that booking emails switch to Saroh, counted, and other email stops", () => {
        const takesOver = buildProvidersView(
            input({
                messaging: [comms("EMAIL", "RESEND")],
                sarohEmail: { state: "OFF", takesOver: true },
            }),
        ).connected[0];
        expect(takesOver.consequence).toMatch(
            /^Booking emails switch to Saroh's email straight away and count against your plan's monthly allowance\. All other email stops being sent\./,
        );
        const not = buildProvidersView(
            input({
                messaging: [comms("EMAIL", "RESEND")],
                sarohEmail: { state: "OFF", takesOver: false },
            }),
        ).connected[0];
        expect(not.consequence).toMatch(
            /^Email stops being sent straight away/,
        );
        // WhatsApp is never Saroh's.
        const wa = buildProvidersView(
            input({
                messaging: [comms("WHATSAPP", "META")],
                sarohEmail: { state: "OFF", takesOver: true },
            }),
        ).connected[0];
        expect(wa.consequence).toMatch(/^WhatsApp messages stop/);
    });

    it("once the business connects its own email, the block goes", () => {
        const view = buildProvidersView(
            input({
                messaging: [comms("EMAIL", "RESEND")],
                sarohEmail: { state: "OFF", takesOver: true },
            }),
        );
        expect(view.bookingEmails).toBeNull();
        expect(view.connectEmailKey).toBeNull();
    });

    it("shows the block even with no module that uses a provider", () => {
        const view = buildProvidersView(
            input({ health: [], sarohEmail: sending() }),
        );
        expect(view.any).toBe(true);
        // Nothing to connect here, so no jump.
        expect(view.connectEmailKey).toBeNull();
    });
});
