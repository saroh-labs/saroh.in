import { describe, expect, it } from "vitest";

import type { BillingAccessView, ModuleAccessView } from "@/lib/billing/access";
import type { ConnectedCommsProvider } from "@/lib/providers/service";

import { composerGate, sendFailureWords } from "./composer-gate";

/**
 * The lead composer's gate per plan (UX-067): Free, whose plan locks the
 * business's own email (DEC-091), is led to the plan that has it; Grow,
 * with room, to Providers; an unread plan reads as room; Communications off
 * hides the composer. Plan names and figures are made up.
 */
const row = (over: Partial<ModuleAccessView>): ModuleAccessView => ({
    moduleId: "integrations",
    name: "Your own email and payment accounts",
    what: "",
    state: "on",
    limit: null,
    per: "",
    text: "",
    override: "",
    usage: 0,
    menu: null,
    child: null,
    upgradeTo: null,
    ...over,
});

const access = (
    plan: string,
    integrations: ModuleAccessView,
    enforced = true,
): BillingAccessView => ({
    source: "catalogue",
    enforced,
    version: 1,
    plan: { id: plan.toLowerCase(), name: plan },
    pricePaise: null,
    planOverride: null,
    pendingMove: null,
    planEnding: null,
    modules: [integrations],
});

const FREE = access(
    "Starter",
    row({
        state: "locked",
        usage: null,
        upgradeTo: { planId: "plus", name: "Plus", pricePaise: 1 },
    }),
);
const GROW = access("Plus", row({ state: "on" }));

const email = (status = "CONNECTED"): ConnectedCommsProvider => ({
    id: "p1",
    channel: "EMAIL",
    provider: "RESEND",
    status,
    fromAddress: null,
    updatedAt: "2026-10-01T00:00:00.000Z",
});

const base = {
    channel: "EMAIL" as const,
    communicationsOn: true,
    canManageModules: true,
};

describe("composerGate", () => {
    it("Free with no email: the plan that has it, and See plans — no Connect", () => {
        const gate = composerGate({ ...base, providers: [], access: FREE });
        expect(gate).toEqual({
            kind: "plan",
            title: "Sending from your own email comes with Plus.",
            cta: "See Plus",
            href: "/settings/billing?plan=plus#change-plan",
        });
    });

    it("Grow with room and no email: connect it in Providers", () => {
        const gate = composerGate({ ...base, providers: [], access: GROW });
        expect(gate).toEqual({
            kind: "connect",
            title: "Connect your email to write from here.",
            cta: "Connect email",
            href: "/settings/providers",
        });
    });

    it("an unread plan reads as room", () => {
        expect(
            composerGate({ ...base, providers: [], access: null }).kind,
        ).toBe("connect");
    });

    it("limits not enforced: room, whatever the row says", () => {
        const loose = { ...FREE, enforced: false };
        expect(
            composerGate({ ...base, providers: [], access: loose }).kind,
        ).toBe("connect");
    });

    it("a paid plan whose connections are all in use says so", () => {
        const full = access("Plus", row({ limit: 1, usage: 1 }));
        const gate = composerGate({ ...base, providers: [], access: full });
        expect(gate.kind).toBe("plan");
        if (gate.kind === "plan") expect(gate.cta).toBe("See plans");
    });

    it("a connected email composes, on any plan", () => {
        expect(
            composerGate({ ...base, providers: [email()], access: FREE }).kind,
        ).toBe("compose");
    });

    it("a disconnected email doesn't send: connect it again", () => {
        expect(
            composerGate({
                ...base,
                providers: [email("DISABLED")],
                access: GROW,
            }).kind,
        ).toBe("connect");
    });

    it("WhatsApp is judged on its own channel", () => {
        const gate = composerGate({
            ...base,
            channel: "WHATSAPP",
            providers: [email()],
            access: GROW,
        });
        expect(gate).toMatchObject({
            kind: "connect",
            title: "Connect WhatsApp to write from here.",
            cta: "Connect WhatsApp",
        });
    });

    it("providers unread: the composer, as before", () => {
        expect(
            composerGate({ ...base, providers: null, access: FREE }).kind,
        ).toBe("compose");
    });

    it("Communications off: no composer, on every plan", () => {
        for (const plan of [FREE, GROW, null]) {
            expect(
                composerGate({
                    ...base,
                    communicationsOn: false,
                    canManageModules: false,
                    providers: [email()],
                    access: plan,
                }),
            ).toEqual({ kind: "off", canManage: false });
        }
    });

    it("modules unread: not treated as off", () => {
        expect(
            composerGate({
                ...base,
                communicationsOn: null,
                providers: [email()],
                access: GROW,
            }).kind,
        ).toBe("compose");
    });
});

describe("sendFailureWords", () => {
    it("never shows the API's raw provider sentence", () => {
        expect(
            sendFailureWords(
                'No connected provider for channel "EMAIL"',
                "EMAIL",
            ),
        ).toBe(
            "Nothing was sent: your email isn't connected. Connect it in Settings › Providers.",
        );
        expect(
            sendFailureWords(
                'Provider for channel "WHATSAPP" is not connected',
                "WHATSAPP",
            ),
        ).toBe(
            "Nothing was sent: WhatsApp is disconnected. Reconnect it in Settings › Providers.",
        );
    });

    it("says the module is off instead of its code", () => {
        expect(sendFailureWords("MODULE_UNAVAILABLE", "EMAIL")).toMatch(
            /Turn on Communications/,
        );
    });

    it("passes merchant words through", () => {
        expect(sendFailureWords("Could not send the message", "EMAIL")).toBe(
            "Could not send the message",
        );
    });
});
