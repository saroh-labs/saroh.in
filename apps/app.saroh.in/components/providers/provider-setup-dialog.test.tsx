// @vitest-environment jsdom
/**
 * Payment setup as guided steps (DEC-063): the API keys, then where the
 * provider sends payment updates — the webhook address from the API, with
 * Copy, and the events to tick — then, for Razorpay, the webhook signing
 * secret, which is required, can be generated, and is copied for pasting
 * into Razorpay. Save stays off until it is filled.
 *
 * `react-dom/client` + `act` directly, as the other component tests do.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
    ConnectedPaymentProvider,
    PaymentWebhookSetup,
} from "@/lib/providers/service";

import { ProviderSetupDialog } from "./provider-setup-dialog";

const connectPaymentProvider = vi.fn();
vi.mock("@/lib/providers/actions", () => ({
    connectPaymentProvider: (...args: unknown[]) =>
        connectPaymentProvider(...args) as unknown,
    disconnectPaymentProvider: vi.fn(),
    connectCommsProvider: vi.fn(),
    disconnectCommsProvider: vi.fn(),
}));

// The business-details step (DEC-068) is pinned in its own test.
vi.mock("@/lib/organizations/settings-actions", () => ({
    readBusinessDetails: vi.fn(),
    saveOrganizationSettings: vi.fn(),
}));

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh }),
}));

const showSuccess = vi.fn();
const showError = vi.fn();
vi.mock("@saroh/ui/toast", () => ({
    showSuccess: (...args: unknown[]) => showSuccess(...args) as unknown,
    showError: (...args: unknown[]) => showError(...args) as unknown,
}));

const writeText = vi.fn(() => Promise.resolve());

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(navigator, "clipboard", {
        value: { writeText },
        configurable: true,
    });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    for (const fn of [
        connectPaymentProvider,
        refresh,
        showSuccess,
        showError,
        writeText,
    ]) {
        fn.mockClear();
    }
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
});

const URL_RZP = "https://api.saroh.in/public/webhooks/razorpay/org_1";
const HOOKS: PaymentWebhookSetup[] = [
    {
        provider: "RAZORPAY",
        url: URL_RZP,
        events: [
            "payment.captured",
            "payment.failed",
            "order.paid",
            "refund.processed",
            "refund.failed",
        ],
        secretRequired: true,
        lastReceivedAt: null,
    },
    {
        provider: "CASHFREE",
        url: "https://api.saroh.in/public/webhooks/cashfree/org_1",
        events: ["PAYMENT_SUCCESS_WEBHOOK"],
        secretRequired: false,
        lastReceivedAt: null,
    },
];

function open(
    provider: "RAZORPAY" | "CASHFREE",
    over: {
        connected?: ConnectedPaymentProvider[];
        webhooks?: PaymentWebhookSetup[] | null;
    } = {},
) {
    act(() => {
        root.render(
            <ProviderSetupDialog
                kind="payments"
                label={provider === "RAZORPAY" ? "Razorpay" : "Cashfree"}
                trigger="Connect"
                urgent={false}
                provider={provider}
                connected={over.connected ?? []}
                webhooks={over.webhooks === undefined ? HOOKS : over.webhooks}
            />,
        );
    });
    const trigger = host.querySelector("button");
    if (!trigger) throw new Error("No trigger");
    act(() => trigger.click());
}

const dialog = () => {
    const el = document.querySelector('[role="dialog"]');
    if (!el) throw new Error("Dialog is not open");
    return el as HTMLElement;
};
const text = () => dialog().textContent;

function byLabel(label: string): HTMLInputElement {
    const lab = Array.from(dialog().querySelectorAll("label")).find((l) =>
        l.textContent.trim().startsWith(label),
    );
    const id = lab?.getAttribute("for");
    const el = id ? document.getElementById(id) : null;
    if (!el) throw new Error(`No field labelled ${label}`);
    return el as HTMLInputElement;
}

function button(name: RegExp): HTMLButtonElement {
    const hit = Array.from(dialog().querySelectorAll("button")).find((b) =>
        name.test((b.getAttribute("aria-label") ?? "") + " " + b.textContent),
    );
    if (!hit) throw new Error(`No button ${name}`);
    return hit;
}

function typeInto(el: HTMLInputElement, value: string) {
    act(() => {
        Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value",
        )?.set?.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
    });
}

const save = () => button(/^ ?Connect Razorpay|Save keys|Connect Cashfree/);

describe("Razorpay setup, as guided steps", () => {
    it("shows the three steps, the webhook URL and the events to tick", () => {
        open("RAZORPAY");
        const t = text();
        expect(t).toContain("Your API keys");
        expect(t).toContain("Tell Razorpay where to send payment updates");
        expect(t).toContain("Accounts & Settings › Webhooks › Add New Webhook");
        expect(byLabel("Webhook URL").value).toBe(URL_RZP);
        expect(byLabel("Webhook URL").readOnly).toBe(true);
        for (const event of HOOKS[0].events) expect(t).toContain(event);
        expect(t).toContain("Webhook signing secret");
        expect(t).toContain("Use the same secret here and in Razorpay");
        // Required, never "optional".
        expect(byLabel("Webhook signing secret").required).toBe(true);
        expect(t).not.toMatch(/Webhook signing secret\s*optional/);
        expect(t).toContain("Autopay adds its own events");
    });

    it("copies the webhook URL and says so", async () => {
        open("RAZORPAY");
        await act(async () => {
            button(/Copy webhook URL/).click();
            await Promise.resolve();
        });
        expect(writeText).toHaveBeenCalledWith(URL_RZP);
        expect(showSuccess).toHaveBeenCalledWith("Webhook URL copied");
    });

    it("keeps Save off until the webhook secret is filled", () => {
        open("RAZORPAY");
        typeInto(byLabel("Key ID"), "rzp_live_AbC123");
        typeInto(byLabel("Key secret"), "super-secret-value");
        expect(save().disabled).toBe(true);
        typeInto(byLabel("Webhook signing secret"), "   ");
        expect(save().disabled).toBe(true);
        typeInto(byLabel("Webhook signing secret"), "whsec_chosen");
        expect(save().disabled).toBe(false);
    });

    it("generates a strong secret, shows it, copies it, and sends it on save", async () => {
        connectPaymentProvider.mockResolvedValue({ ok: true, data: {} });
        open("RAZORPAY");
        typeInto(byLabel("Key ID"), "rzp_live_AbC123");
        typeInto(byLabel("Key secret"), "super-secret-value");
        const copySecret = button(/Copy webhook signing secret/);
        expect(copySecret.disabled).toBe(true);

        act(() => button(/Generate a webhook signing secret/).click());
        const field = byLabel("Webhook signing secret");
        expect(field.value).toMatch(/^[0-9a-f]{48}$/);
        expect(field.type).toBe("text");
        expect(save().disabled).toBe(false);

        await act(async () => {
            button(/Copy webhook signing secret/).click();
            await Promise.resolve();
        });
        expect(writeText).toHaveBeenCalledWith(field.value);
        expect(showSuccess).toHaveBeenCalledWith("Webhook secret copied");

        await act(async () => {
            save().click();
            await Promise.resolve();
        });
        expect(connectPaymentProvider).toHaveBeenCalledWith({
            provider: "RAZORPAY",
            keyId: "rzp_live_AbC123",
            keySecret: "super-secret-value",
            webhookSecret: field.value,
        });
    });

    it("says test mode for a test key", () => {
        open("RAZORPAY");
        expect(text()).not.toContain("Test mode");
        typeInto(byLabel("Key ID"), "rzp_test_AbC123");
        expect(text()).toContain(
            "Test mode — use Razorpay's test dashboard for the webhook too.",
        );
    });

    it("says the address couldn't be loaded rather than show none", () => {
        open("RAZORPAY", { webhooks: null });
        expect(text()).toContain("The webhook address couldn't be loaded");
        // The secret is still required.
        expect(byLabel("Webhook signing secret").required).toBe(true);
    });

    it("says Saroh hasn't set the address when the server has none", () => {
        open("RAZORPAY", {
            webhooks: HOOKS.map((h) => ({ ...h, url: null })),
        });
        expect(text()).toContain(
            "Saroh hasn't set the address Razorpay should send payment updates to yet",
        );
        expect(text()).not.toContain("api.saroh.in");
    });

    it("tells a connection saved without the secret what it's missing", () => {
        open("RAZORPAY", {
            connected: [
                {
                    id: "mpp_1",
                    provider: "RAZORPAY",
                    status: "CONNECTED",
                    publicKey: "rzp_live_AbC123",
                    webhookSecretMissing: true,
                    updatedAt: "",
                },
            ],
        });
        expect(text()).toContain(
            "This connection was saved without its webhook signing secret",
        );
        expect(text()).toContain(
            "No webhook signing secret — enter the keys again below",
        );
    });
});

describe("Cashfree setup", () => {
    it("shows its webhook URL but asks for no separate secret", () => {
        open("CASHFREE");
        const t = text();
        expect(t).toContain("Tell Cashfree where to send payment updates");
        expect(byLabel("Webhook URL").value).toBe(HOOKS[1].url);
        expect(t).toContain("no separate secret to add");
        expect(() => byLabel("Webhook signing secret")).toThrow();
        // Cashfree has no autopay (#824).
        expect(t).not.toContain("Autopay");

        typeInto(byLabel("Key ID"), "TEST1234app");
        typeInto(byLabel("Key secret"), "cfsk_secret");
        expect(save().disabled).toBe(false);
    });
});
