import { describe, expect, it } from "vitest";

import type { ProviderHealth } from "@/lib/provider-health/service";

import type { ProviderRowsInput } from "./rows";
import { buildProviderRows, dashboardFor } from "./rows";

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

const byKey = (rows: ReturnType<typeof buildProviderRows>, key: string) => {
    const row = rows.find((r) => r.key === key);
    if (!row) throw new Error(`no ${key} row`);
    return row;
};

describe("provider rows", () => {
    it("splits messaging into its two channels", () => {
        expect(buildProviderRows(input()).map((r) => r.key)).toEqual([
            "PAYMENTS",
            "EMAIL",
            "WHATSAPP",
            "DOMAINS",
        ]);
    });

    it("offers Connect, and nothing to manage, before anything is set up", () => {
        const pay = byKey(buildProviderRows(input()), "PAYMENTS");
        expect(pay.state).toBe("NOT_CONNECTED");
        expect(pay.connections).toEqual([]);
        expect(pay.note).toBe("Connect a payment provider to accept payments.");
    });

    it("names a connected payment provider, its public key and the checkout that uses it", () => {
        const rows = buildProviderRows(
            input({
                payments: [
                    {
                        id: "p1",
                        provider: "RAZORPAY",
                        status: "CONNECTED",
                        publicKey: "rzp_live_abc",
                        updatedAt: "",
                    },
                ],
                checkout: [
                    { name: "Rye & Co.", provider: "RAZORPAY" },
                    { name: "Pop-up", provider: null },
                ],
            }),
        );
        const pay = byKey(rows, "PAYMENTS");
        expect(pay.state).toBe("CONNECTED");
        expect(pay.note).toContain("through Razorpay");
        expect(pay.refs).toEqual([
            { label: "Public key", code: "rzp_live_abc" },
        ]);
        expect(pay.usedBy).toBe("Used by Rye & Co. checkout");
        expect(pay.connections).toEqual([
            {
                name: "Razorpay",
                manageHref: "https://dashboard.razorpay.com",
                target: { kind: "payments", provider: "RAZORPAY" },
            },
        ]);
    });

    it("calls a provider someone disconnected disconnected, not broken", () => {
        const pay = byKey(
            buildProviderRows(
                input({
                    payments: [
                        {
                            id: "p1",
                            provider: "CASHFREE",
                            status: "DISABLED",
                            publicKey: null,
                            updatedAt: "",
                        },
                    ],
                }),
            ),
            "PAYMENTS",
        );
        expect(pay.state).toBe("DISCONNECTED");
        expect(pay.connections).toEqual([]);
        expect(pay.refs).toEqual([]);
    });

    it("gives each messaging channel its own state and sender", () => {
        const rows = buildProviderRows(
            input({
                messaging: [
                    {
                        id: "c1",
                        channel: "EMAIL",
                        provider: "SMTP",
                        status: "CONNECTED",
                        fromAddress: "hello@rye.example",
                        updatedAt: "",
                    },
                ],
            }),
        );
        const email = byKey(rows, "EMAIL");
        expect(email.state).toBe("CONNECTED");
        expect(email.refs).toEqual([
            { label: "Sends from", code: "hello@rye.example" },
        ]);
        // An SMTP relay has no dashboard we know of: no Manage, still Disconnect.
        expect(email.connections[0]?.manageHref).toBeNull();
        expect(email.connections[0]?.target).toEqual({
            kind: "messaging",
            channel: "EMAIL",
        });
        expect(byKey(rows, "WHATSAPP").state).toBe("NOT_CONNECTED");
    });

    it("never claims a channel is connected without the list to show it", () => {
        const health = HEALTH.map((h) =>
            h.key === "COMMUNICATIONS"
                ? { ...h, status: "ACTIVE" as const }
                : h,
        );
        const rows = buildProviderRows(input({ health, messaging: null }));
        expect(byKey(rows, "EMAIL").state).toBe("NOT_CONNECTED");
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
        const dom = byKey(
            buildProviderRows(
                input({
                    health,
                    domains: [{ hostname: "rye.example", status: "PENDING" }],
                }),
            ),
            "DOMAINS",
        );
        expect(dom.state).toBe("PENDING");
        expect(dom.refs).toEqual([
            { label: "Waiting for DNS", code: "rye.example" },
        ]);
        expect(dom.connections).toEqual([]);
        expect(dom.setup).toEqual({
            kind: "link",
            href: "/sites",
            label: "Check DNS",
        });
    });

    it("knows only real dashboards", () => {
        expect(dashboardFor("stripe")).toBe("https://dashboard.stripe.com");
        expect(dashboardFor("SMTP")).toBeNull();
    });
});
