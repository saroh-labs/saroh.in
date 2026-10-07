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
vi.mock("@saroh/ui/toast", () => ({
    showError: (...args: unknown[]) => showError(...args) as unknown,
    showSuccess: vi.fn(),
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
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    update.mockReset();
    showError.mockReset();
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

describe("the location limit, by the radio (UX-036)", () => {
    it("says the refusal beside the kind, and keeps it on No counter", async () => {
        update.mockResolvedValue({
            ok: false,
            error: "You've reached your 2 places customers visit on this plan.",
        });
        draw();
        await act(async () => {
            item("Customers visit")?.click();
            await Promise.resolve();
        });
        await act(async () => {
            await new Promise((r) => setTimeout(r, 0));
        });
        const alert = host.querySelector("#storefront-kind-error");
        expect(alert?.textContent).toBe(
            "You've reached your 2 places customers visit on this plan.",
        );
        expect(showError).not.toHaveBeenCalled();
        expect(item("No counter")?.getAttribute("data-state")).toBe("on");
    });

    it("says why Pick-up isn't on the website from a No counter place (UX-025)", () => {
        draw();
        expect(host.textContent).toContain(
            "Your website doesn't offer Pick-up from here",
        );
    });

    it("claims no switch that isn't live (UX-082)", () => {
        draw();
        expect(host.textContent).not.toContain("Not live yet");
        expect(host.textContent).not.toContain("tip at checkout");
        expect(host.textContent).not.toContain("keyed in here");
    });
});
