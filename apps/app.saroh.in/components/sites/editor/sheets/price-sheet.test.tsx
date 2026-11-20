// @vitest-environment jsdom
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PRICE_WRITES_ON, PriceSheet } from "./price-sheet";

const readServicePrice = vi.fn();
const readServiceUses = vi.fn();
const updateService = vi.fn();
vi.mock("@/lib/sites/service-price-read", () => ({
    readServicePrice: (...a: unknown[]) => readServicePrice(...a) as unknown,
}));
vi.mock("@/lib/sites/service-uses-read", () => ({
    readServiceUses: (...a: unknown[]) => readServiceUses(...a) as unknown,
}));
vi.mock("@/lib/services/actions", () => ({
    updateService: (...a: unknown[]) => updateService(...a) as unknown,
}));
vi.mock("@saroh/ui/toast", () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
}));

/**
 * The price sheet (U48) while O1 waits for the owner: the price, where it
 * shows and the way to Services; nothing is written from the editor.
 * Sample amounts only.
 */
let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    readServicePrice.mockResolvedValue({
        ok: true,
        data: {
            name: "Sample service",
            priceCents: 12_300,
            currency: "INR",
            durationMinutes: 45,
        },
    });
    readServiceUses.mockResolvedValue({
        ok: true,
        data: {
            serviceId: "svc_1",
            bookingPage: true,
            pages: [
                {
                    pageId: "pg_1",
                    title: "Services",
                    path: "/services",
                    sections: [
                        {
                            key: "k1",
                            label: "Our prices",
                            draft: true,
                            live: true,
                        },
                        {
                            key: "k2",
                            label: "Book now",
                            draft: true,
                            live: false,
                        },
                    ],
                },
            ],
        },
    });
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
    vi.clearAllMocks();
});

const close = vi.fn();
async function open(serviceId: string | null = "svc_1") {
    await act(async () => {
        root.render(
            <PriceSheet
                siteId="site_1"
                serviceId={serviceId}
                onClose={close}
            />,
        );
        await new Promise((r) => setTimeout(r, 0));
    });
}

describe("PriceSheet without O1 (U48)", () => {
    it("is switched off until the owner says yes", () => {
        expect(PRICE_WRITES_ON).toBe(false);
    });

    it("shows the price, where it shows, and Edit in Services", async () => {
        await open();
        const text = document.body.textContent;
        expect(text).toContain("Sample service price");
        expect(text).toMatch(/₹\s?123/);
        expect(text).toContain("45 min · from Services");
        expect(text).toContain("Services · Our prices and Book now");
        expect(text).toContain("The booking page, and new bills");
        const link = Array.from(document.querySelectorAll("a")).find(
            (a) => a.textContent === "Edit in Services",
        );
        expect(link?.getAttribute("href")).toBe("/services/svc_1");
        // Nothing here writes a price.
        expect(text).not.toContain("Save price");
        expect(document.querySelector("input")).toBeNull();
        expect(updateService).not.toHaveBeenCalled();
        expect(readServiceUses).toHaveBeenCalledWith("site_1", "svc_1");
    });

    it("says a failed read, never a price of nothing", async () => {
        readServicePrice.mockResolvedValue({ ok: false, reason: "failed" });
        await open();
        const text = document.body.textContent;
        expect(text).toContain("Couldn't read the price.");
        expect(text).toContain("Try again");
        expect(text).not.toContain("No price yet");
    });

    it("draws nothing while closed", async () => {
        await open(null);
        expect(readServicePrice).not.toHaveBeenCalled();
        expect(document.body.textContent).not.toContain("price");
    });
});
