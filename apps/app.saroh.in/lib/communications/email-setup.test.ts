import { describe, expect, it } from "vitest";

import {
    emailPrompt,
    emailRefusalNote,
    INVOICE_EMAIL_WORDS,
} from "./email-setup";

const MISSED =
    "No email provider is connected, so invoices, booking and order updates and review invitations aren't emailed. Your customers see their updates only in their account.";
const all = { connect: true, plans: true };
const none = { connected: false, canConnect: true };
const free = { connected: false, canConnect: false };

describe("emailPrompt (DEC-011, 7 Oct)", () => {
    it("says what the customers miss, and offers Connect", () => {
        expect(emailPrompt(none, all)).toEqual({
            kind: "connect",
            title: "Your customers get no emails from you",
            text: MISSED,
            action: {
                href: "/settings/providers",
                label: "Connect your email",
            },
        });
        // A plan that couldn't be read still offers connecting.
        expect(
            emailPrompt({ connected: false, canConnect: null }, all)?.kind,
        ).toBe("connect");
    });

    it("on Providers, Connect jumps to the email provider to connect", () => {
        expect(emailPrompt(none, all, "#connect-email")?.action).toEqual({
            href: "#connect-email",
            label: "Connect your email",
        });
        // Nowhere to connect one here: no prompt to connect.
        expect(emailPrompt(none, all, null)).toBeNull();
    });

    it("on a plan that can't connect one (DEC-091), says a paid plan brings it and links the plans", () => {
        expect(emailPrompt(free, all)).toEqual({
            kind: "plans",
            title: "Your customers get no emails from you",
            text: `${MISSED} Connecting your own email comes with a paid plan.`,
            action: {
                href: "/settings/billing#change-plan",
                label: "See plans",
            },
        });
        // Whatever this page could connect to.
        expect(emailPrompt(free, all, null)?.kind).toBe("plans");
    });

    it("only to who can act: comms:manage to connect, billing:read for plans", () => {
        expect(emailPrompt(none, { connect: false, plans: true })).toBeNull();
        expect(emailPrompt(free, { connect: true, plans: false })).toBeNull();
        expect(emailPrompt(none, { connect: true, plans: false })?.kind).toBe(
            "connect",
        );
        expect(emailPrompt(free, { connect: false, plans: true })?.kind).toBe(
            "plans",
        );
    });

    it("goes once a provider is connected, and says nothing when unread", () => {
        expect(
            emailPrompt({ connected: true, canConnect: null }, all),
        ).toBeNull();
        expect(emailPrompt(null, all)).toBeNull();
    });

    it("never names a currency or a price", () => {
        for (const p of [emailPrompt(none, all), emailPrompt(free, all)]) {
            expect(JSON.stringify(p)).not.toMatch(/₹|\d/);
        }
    });
});

describe("emailRefusalNote: where a send is refused", () => {
    it("an invoice: why, and Connect one for who may", () => {
        expect(emailRefusalNote(none, all, INVOICE_EMAIL_WORDS)).toEqual({
            text: "Invoices are emailed from your own email provider, and none is connected, so this one can't be sent.",
            action: { href: "/settings/providers", label: "Connect one" },
        });
        expect(
            emailRefusalNote(
                none,
                { connect: false, plans: true },
                INVOICE_EMAIL_WORDS,
            ),
        ).toEqual({ text: INVOICE_EMAIL_WORDS.connect, action: null });
    });

    it("on Free: a paid plan, and See plans for who may", () => {
        expect(emailRefusalNote(free, all, INVOICE_EMAIL_WORDS)).toEqual({
            text: "Invoices are emailed from your own email provider, and connecting one comes with a paid plan.",
            action: {
                href: "/settings/billing#change-plan",
                label: "See plans",
            },
        });
        expect(
            emailRefusalNote(
                free,
                { connect: true, plans: false },
                INVOICE_EMAIL_WORDS,
            )?.action,
        ).toBeNull();
    });

    it("nothing once connected, or unread", () => {
        expect(
            emailRefusalNote(
                { connected: true, canConnect: null },
                all,
                INVOICE_EMAIL_WORDS,
            ),
        ).toBeNull();
        expect(emailRefusalNote(null, all, INVOICE_EMAIL_WORDS)).toBeNull();
    });
});
