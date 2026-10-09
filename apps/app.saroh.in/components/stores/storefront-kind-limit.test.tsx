// @vitest-environment jsdom
/**
 * Sell → Locations: a change of kind the plan refuses (the places customers
 * visit, UX-036) is said by the radio it stopped, not in a toast, and the
 * radio stays where it was. Made-up words and numbers only.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { StorefrontSettings } from "@/lib/stores/storefronts";

import { StorefrontsScreen } from "./storefronts-screen";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
}));
const update = vi.fn();
vi.mock("@/lib/stores/storefront-actions", () => ({
    closeStorefront: vi.fn(),
    updateStorefront: (...args: unknown[]) => update(...args) as unknown,
}));
const showError = vi.fn();
const showSuccess = vi.fn();
vi.mock("@saroh/ui/toast", () => ({
    showError: (...args: unknown[]) => showError(...args) as unknown,
    showSuccess: (...args: unknown[]) => showSuccess(...args) as unknown,
    showUndo: vi.fn(),
}));

const online: StorefrontSettings = {
    id: "st_online",
    name: "Online",
    orderCount: 0,
    kind: "ONLINE",
    paused: false,
    currency: "INR",
    currencyLocked: true,
    taxEnabled: false,
    taxRate: "0.00",
    shippingEnabled: false,
    freeShippingThreshold: null,
    unfulfilled: 0,
    address: null,
    openingHours: null,
    collectionEnabled: true,
    fulfilmentTypes: ["PICKUP"],
    tipsEnabled: false,
    guestCheckout: true,
    pausedAt: null,
    linkSameEmailCustomers: false,
    checkoutProvider: null,
    effectiveProvider: null,
    providers: [],
};

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    // Radix's switch measures itself; jsdom has no layout to measure.
    vi.stubGlobal(
        "ResizeObserver",
        class {
            observe = vi.fn();
            unobserve = vi.fn();
            disconnect = vi.fn();
        },
    );
    Element.prototype.scrollIntoView = vi.fn();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    update.mockReset();
    showError.mockReset();
    showSuccess.mockReset();
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

function draw() {
    act(() =>
        root.render(
            <StorefrontsScreen
                businessName="Rye & Co."
                storefronts={[
                    {
                        id: online.id,
                        name: online.name,
                        orderCount: 0,
                        kind: "ONLINE",
                        paused: false,
                    },
                ]}
                selected={online}
                canCreate
                canEdit
                canClose
            />,
        ),
    );
}

const item = (name: string) =>
    Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find(
        (b) => b.textContent === name,
    );

/** Lets the save's transition and its awaited action settle. */
async function settle() {
    await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
    });
}

async function press(button: HTMLButtonElement | null | undefined) {
    await act(async () => {
        button?.click();
        await Promise.resolve();
    });
    await settle();
}

/** Types into a controlled input the way React hears it. */
function type(field: HTMLInputElement | null, value: string) {
    act(() => {
        Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value",
        )?.set?.call(field, value);
        field?.dispatchEvent(new Event("input", { bubbles: true }));
    });
}

describe("the location limit, by the radio (UX-036)", () => {
    it("says the refusal beside the kind, and keeps it on No, online only", async () => {
        update.mockResolvedValue({
            ok: false,
            error: "You've reached your 2 places customers visit on this plan.",
        });
        draw();
        await press(item("Yes, they visit"));
        const alert = host.querySelector("#location-kind-error");
        expect(alert?.textContent).toBe(
            "You've reached your 2 places customers visit on this plan.",
        );
        expect(showError).not.toHaveBeenCalled();
        expect(item("No, online only")?.getAttribute("data-state")).toBe("on");
    });

    it("becoming a place customers visit asks for its address next", async () => {
        update.mockImplementation((_id: string, input: object) =>
            Promise.resolve({ ok: true, data: { ...online, ...input } }),
        );
        draw();
        await press(item("Yes, they visit"));
        expect(update).toHaveBeenCalledWith(online.id, { kind: "SHOP" });
        expect(document.activeElement?.id).toBe("storefront-address");
    });

    it("claims no switch that isn't live (UX-082)", () => {
        draw();
        expect(host.textContent).not.toContain("Not live yet");
        expect(host.textContent).not.toContain("tip at checkout");
        expect(host.textContent).not.toContain("keyed in here");
    });
});

describe("Pick-up needs a counter (UX-025)", () => {
    const pickup = () =>
        host.querySelector<HTMLButtonElement>("#storefront-way-pickup");

    it("saved on with no counter: shown as it is, says why, and turns off", async () => {
        update.mockImplementation((_id: string, input: object) =>
            Promise.resolve({ ok: true, data: { ...online, ...input } }),
        );
        draw();
        expect(host.textContent).toContain(
            "Not on your website: it needs a counter.",
        );
        // Drawing it changed nothing.
        expect(update).not.toHaveBeenCalled();
        expect(pickup()?.getAttribute("aria-checked")).toBe("true");
        expect(pickup()?.disabled).toBe(false);

        await press(pickup());
        expect(update).toHaveBeenCalledWith(online.id, {
            fulfilmentTypes: [],
        });
        expect(showSuccess).toHaveBeenCalledWith("Pick-up turned off");
        // Off now, and with no counter it can't come back on.
        expect(pickup()?.disabled).toBe(true);
        expect(host.textContent).toContain("Needs a counter");
    });
});

describe("a delivery row", () => {
    const shop: StorefrontSettings = {
        ...online,
        kind: "SHOP",
        address: "12 Hill Road",
        fulfilmentTypes: ["PICKUP", "LOCAL_DELIVERY"],
        siteShop: true,
        localDeliveryFee: null,
    };
    const drawShop = () =>
        act(() =>
            root.render(
                <StorefrontsScreen
                    businessName="Rye & Co."
                    storefronts={[
                        {
                            id: shop.id,
                            name: shop.name,
                            orderCount: 0,
                            kind: "SHOP",
                            paused: false,
                        },
                    ]}
                    selected={shop}
                    canCreate
                    canEdit
                    canClose
                />,
            ),
        );

    it("saves a late time alone in its own words", async () => {
        update.mockResolvedValue({ ok: true, data: shop });
        drawShop();
        const field = host.querySelector<HTMLInputElement>(
            "#storefront-way-pickup-late",
        );
        expect(field?.value).toBe("2");
        type(field, "3");
        await press(item("Save"));
        expect(update).toHaveBeenCalledWith(shop.id, {
            lateAfterMinutes: { PICKUP: 180 },
        });
        expect(showSuccess).toHaveBeenCalledWith(
            "Pick-up orders now count as late after 3 hours",
        );
    });

    it("saves a fee and a late time together", async () => {
        update.mockResolvedValue({ ok: true, data: shop });
        drawShop();
        type(
            host.querySelector<HTMLInputElement>(
                "#storefront-way-local_delivery-fee",
            ),
            "40",
        );
        type(
            host.querySelector<HTMLInputElement>(
                "#storefront-way-local_delivery-late",
            ),
            "12",
        );
        await press(item("Save"));
        expect(update).toHaveBeenCalledWith(shop.id, {
            localDeliveryFee: "40",
            lateAfterMinutes: { LOCAL_DELIVERY: 720 },
        });
        expect(showSuccess).toHaveBeenCalledWith("Local delivery saved");
    });

    it("refuses a late time out of bounds before it is sent", () => {
        drawShop();
        type(
            host.querySelector<HTMLInputElement>("#storefront-way-pickup-late"),
            "0",
        );
        expect(host.textContent).toContain("Between 5 minutes and 30 days.");
        expect(item("Save")?.disabled).toBe(true);
    });
});
