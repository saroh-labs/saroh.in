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

import { ProviderSetupSheet } from "./provider-setup-sheet";

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
    edition.name = "INDIA";
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
    provider: "RAZORPAY" | "CASHFREE" | "STRIPE" | undefined,
    over: {
        connected?: ConnectedPaymentProvider[];
        webhooks?: PaymentWebhookSetup[] | null;
    } = {},
) {
    act(() => {
        root.render(
            <ProviderSetupSheet
                kind="payments"
                label={provider ?? "Payments"}
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

const save = () =>
    button(/^ ?Connect Razorpay|Save keys|Connect Cashfree|Connect Stripe/);

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
        // The button says it, where the eye already is: no toast.
        expect(button(/Copy webhook URL/).textContent).toBe("Copied");
    });

    it("connects nothing until the webhook secret is filled, and says what is missing", async () => {
        open("RAZORPAY");
        typeInto(byLabel("Key ID"), "rzp_live_AbC123");
        typeInto(byLabel("Key secret"), "super-secret-value");
        typeInto(byLabel("Webhook signing secret"), "   ");
        // The button is never off: pressing it says what is missing.
        expect(save().disabled).toBe(false);
        await act(async () => {
            save().click();
            await Promise.resolve();
        });
        expect(connectPaymentProvider).not.toHaveBeenCalled();
        expect(text()).toContain(
            "Enter the key ID, the key secret and the webhook signing secret to connect.",
        );
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
        expect(button(/Copy webhook signing secret/).textContent).toBe(
            "Copied",
        );

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
            "Test mode: use Razorpay's test dashboard for the webhook too.",
        );
    });

    it("says the address couldn't be loaded rather than show none", () => {
        open("RAZORPAY", { webhooks: null });
        expect(text()).toContain("Couldn't load the webhook address.");
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
            "No webhook signing secret. Enter the keys again below.",
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

describe("which providers each edition offers", () => {
    it("India: Razorpay first, then Cashfree, never Stripe", () => {
        open(undefined);
        expect(text()).toContain("Tell Razorpay where to send payment updates");
        expect(text()).not.toContain("Stripe");
        // A choice of two, opening on Razorpay.
        expect(byLabel("Provider").textContent).toContain("Razorpay");
    });

    it("Global: Stripe only, with no picker", () => {
        edition.name = "GLOBAL";
        open(undefined);
        const t = text();
        expect(t).toContain("Tell Stripe where to send payment updates");
        expect(t).not.toMatch(/Razorpay|Cashfree/);
        expect(() => byLabel("Provider")).toThrow();
    });
});

const URL_STRIPE = "https://api.saroh.in/public/webhooks/stripe/org_1";
const STRIPE_EVENTS = [
    "payment_intent.succeeded",
    "payment_intent.payment_failed",
    "refund.created",
    "refund.updated",
    "refund.failed",
    "checkout.session.completed",
    "checkout.session.async_payment_succeeded",
    "checkout.session.async_payment_failed",
    "checkout.session.expired",
];
const STRIPE_HOOKS: PaymentWebhookSetup[] = [
    {
        provider: "STRIPE",
        url: URL_STRIPE,
        events: STRIPE_EVENTS,
        secretRequired: true,
        lastReceivedAt: null,
    },
];

function openStripe(over: { connected?: ConnectedPaymentProvider[] } = {}) {
    edition.name = "GLOBAL";
    open("STRIPE", { webhooks: STRIPE_HOOKS, ...over });
}

/** Each field's message under it, by its label. */
function said(label: string): string | null {
    const field = byLabel(label);
    const id = field.getAttribute("aria-describedby");
    return id ? (document.getElementById(id)?.textContent ?? null) : null;
}

function fillStripe(
    keys: Partial<Record<"pk" | "rk" | "wh", string>> = {},
): void {
    typeInto(byLabel("Publishable key"), keys.pk ?? "pk_test_example");
    typeInto(byLabel("Restricted key"), keys.rk ?? "rk_test_example");
    typeInto(byLabel("Webhook signing secret"), keys.wh ?? "whsec_example");
}

async function press() {
    await act(async () => {
        save().click();
        await Promise.resolve();
    });
}

describe("Stripe setup (Global)", () => {
    it("asks for three things, as the steps taken in Stripe", () => {
        openStripe();
        const t = text();
        expect(t).toContain("Developers › API keys");
        expect(t).toContain(
            "create a restricted key with Checkout Sessions: Write, Customers: Write, Payment Intents: Read and Refunds: Write.",
        );
        expect(STRIPE_EVENTS).toHaveLength(9);
        expect(t).toContain("Developers › Webhooks › Add endpoint");
        expect(t).toContain("choose API version 2026-10-28.endive");
        expect(byLabel("Webhook URL").value).toBe(URL_STRIPE);
        for (const event of STRIPE_EVENTS) expect(t).toContain(event);
        expect(t).toContain(
            "Customers pay on Stripe's own checkout page, by card (Apple Pay and Google Pay included) or Link.",
        );
        expect(t).not.toContain("turn on in Stripe");
        expect(t).toContain("Stripe also emails its own receipt");
        expect(byLabel("Publishable key").type).toBe("text");
        expect(byLabel("Restricted key").type).toBe("password");
        expect(byLabel("Webhook signing secret").type).toBe("password");
        // Stripe makes the secret: nothing to generate, no autopay events.
        expect(() => button(/Generate/)).toThrow();
        expect(t).not.toContain("Autopay");
        expect(t).not.toContain("Key ID");
    });

    it("says what each key should start with, as it is typed", () => {
        openStripe();
        typeInto(byLabel("Publishable key"), "rk_test_example");
        expect(said("Publishable key")).toBe(
            "That isn't a publishable key. It starts pk_live_ or pk_test_.",
        );
        typeInto(byLabel("Restricted key"), "pk_test_example");
        expect(said("Restricted key")).toBe(
            "That isn't a restricted key. It starts rk_live_ or rk_test_.",
        );
        typeInto(byLabel("Webhook signing secret"), "example");
        expect(said("Webhook signing secret")).toBe(
            "That isn't a webhook signing secret. It starts whsec_.",
        );
        expect(
            byLabel("Webhook signing secret").getAttribute("aria-invalid"),
        ).toBe("true");
    });

    it("turns away a full secret key", async () => {
        openStripe();
        fillStripe({ rk: "sk_test_example" });
        expect(said("Restricted key")).toBe(
            "Use a restricted key, not your secret key. In Stripe, create one with Checkout Sessions: Write, Customers: Write, Payment Intents: Read and Refunds: Write.",
        );
        await press();
        expect(connectPaymentProvider).not.toHaveBeenCalled();
    });

    it("wants both keys in the same mode", async () => {
        openStripe();
        fillStripe({ pk: "pk_live_example", rk: "rk_test_example" });
        expect(said("Restricted key")).toBe(
            "The publishable key is a live key and the restricted key is a test key. Use two test keys or two live keys.",
        );
        await press();
        expect(connectPaymentProvider).not.toHaveBeenCalled();
    });

    it("says what is missing once the button is pressed", async () => {
        openStripe();
        expect(said("Publishable key")).toBe(
            "Opens your checkout, so customers see it.",
        );
        await press();
        expect(connectPaymentProvider).not.toHaveBeenCalled();
        expect(said("Publishable key")).toBe(
            "Enter the publishable key. It starts pk_live_ or pk_test_.",
        );
        expect(said("Restricted key")).toBe(
            "Enter the restricted key. It starts rk_live_ or rk_test_.",
        );
        expect(said("Webhook signing secret")).toBe(
            "Enter the webhook signing secret. It starts whsec_.",
        );
        expect(text()).toContain("Check the keys marked above to connect.");
    });

    it("reads test keys as test mode", () => {
        openStripe();
        expect(text()).not.toContain("Test mode");
        typeInto(byLabel("Publishable key"), "pk_test_example");
        expect(text()).toContain(
            "Test mode: use Stripe's test dashboard for the webhook too.",
        );
    });

    it("sends the three keys, the publishable key as the public one", async () => {
        connectPaymentProvider.mockResolvedValue({ ok: true, data: {} });
        openStripe();
        fillStripe({ pk: " pk_live_example ", rk: "rk_live_example" });
        await press();
        expect(connectPaymentProvider).toHaveBeenCalledWith({
            provider: "STRIPE",
            keyId: "pk_live_example",
            keySecret: "rk_live_example",
            publicKey: "pk_live_example",
            webhookSecret: "whsec_example",
        });
        expect(showSuccess).toHaveBeenCalledWith("Stripe connected.");
    });

    it.each([
        ["keySecret", "Restricted key"],
        ["publicKey", "Publishable key"],
        ["keyId", "Publishable key"],
        ["webhookSecret", "Webhook signing secret"],
    ])(
        "puts the API's refusal about %s under %s, and clears it when that key changes",
        async (field, label) => {
            const error =
                "This key can't make Checkout sessions or customers, or see payments and refunds. Give it Checkout Sessions: Write, Customers: Write, Payment Intents: Read and Refunds: Write.";
            connectPaymentProvider.mockResolvedValue({
                ok: false,
                error,
                field,
            });
            openStripe();
            fillStripe();
            await press();
            expect(said(label)).toBe(error);
            expect(showError).not.toHaveBeenCalled();
            const typed =
                label === "Restricted key"
                    ? "rk_test_other"
                    : label === "Publishable key"
                      ? "pk_test_other"
                      : "whsec_other";
            typeInto(byLabel(label), typed);
            expect(said(label)).not.toBe(error);
        },
    );

    it("says a refusal with no field as a toast", async () => {
        connectPaymentProvider.mockResolvedValue({
            ok: false,
            error: "We couldn't reach Stripe to check these keys. Try again in a minute.",
        });
        openStripe();
        fillStripe();
        await press();
        expect(showError).toHaveBeenCalledWith(
            "We couldn't reach Stripe to check these keys. Try again in a minute.",
        );
    });
});
