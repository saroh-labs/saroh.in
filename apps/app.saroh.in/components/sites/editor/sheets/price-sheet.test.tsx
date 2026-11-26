// @vitest-environment jsdom
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PRICE_WRITES_ON, PriceSheet } from "./price-sheet";

const readServicePrice = vi.fn();
const readServiceUses = vi.fn();
const updateService = vi.fn();
vi.mock("@/lib/sites/price-read", () => ({
    readServicePrice: (...a: unknown[]) => readServicePrice(...a) as unknown,
}));
vi.mock("@/lib/sites/uses-read", () => ({
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
 * The price sheet (U48, O1): a role with `service:write` changes the price
 * in Services from here; any other role reads it with who can change it.
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
            canWrite: true,
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

function input(): HTMLInputElement {
    const el = document.querySelector("input");
    if (!el) throw new Error("The Price field isn't there");
    return el;
}
/** Type into the field the way React hears it. */
function type(value: string) {
    const el = input();
    act(() => {
        Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value",
        )?.set?.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
    });
}
async function submit() {
    await act(async () => {
        document
            .querySelector("form")
            ?.dispatchEvent(
                new Event("submit", { bubbles: true, cancelable: true }),
            );
        await new Promise((r) => setTimeout(r, 0));
    });
}

describe("PriceSheet with O1 (U48)", () => {
    it("writes to Services: the owner said yes", () => {
        expect(PRICE_WRITES_ON).toBe(true);
    });

    it("shows the price field, where it shows and the board's words", async () => {
        await open();
        const text = document.body.textContent;
        expect(text).toContain("Sample service price");
        expect(text).toContain("A service in Services");
        expect(input().value).toBe("123");
        expect(text).toMatch(/Was ₹\s?123 · 45 min · from Services/);
        expect(text).toContain(
            "Changes it in Services and everywhere it shows",
        );
        expect(text).toContain("Services · Our prices and Book now");
        expect(text).toContain("The booking page, and new bills");
        expect(text).toContain(
            "Bookings already made keep the price they were made at.",
        );
        expect(text).toContain("Saved in Services · shows here at once");
        expect(text).toContain("Save price");
        expect(readServiceUses).toHaveBeenCalledWith("site_1", "svc_1");
    });

    it("saves through the service's update, then redraws and closes", async () => {
        updateService.mockResolvedValue({ ok: true, data: {} });
        const saved = vi.fn();
        await act(async () => {
            root.render(
                <PriceSheet
                    siteId="site_1"
                    serviceId="svc_1"
                    onClose={close}
                    onSaved={saved}
                />,
            );
            await new Promise((r) => setTimeout(r, 0));
        });
        type("456");
        await submit();
        expect(updateService).toHaveBeenCalledWith("svc_1", {
            priceCents: 45_600,
        });
        expect(saved).toHaveBeenCalledOnce();
        expect(close).toHaveBeenCalled();
    });

    it("refuses an empty price with words, and saves nothing", async () => {
        await open();
        type("");
        await submit();
        expect(document.body.textContent).toContain(
            "Type a price of 0 or more",
        );
        expect(updateService).not.toHaveBeenCalled();
    });

    it("never holds a minus: the money box drops it", async () => {
        await open();
        type("-5");
        expect(input().value).toBe("5");
    });

    it("shows the API's refusal beside the field", async () => {
        updateService.mockResolvedValue({
            ok: false,
            error: "Sample refusal from the API.",
        });
        await open();
        type("456");
        await submit();
        expect(document.body.textContent).toContain(
            "Sample refusal from the API.",
        );
        expect(close).not.toHaveBeenCalled();
    });

    it("keeps the number and offers Try again when the save gets no answer", async () => {
        updateService.mockRejectedValueOnce(new Error("offline"));
        await open();
        type("456");
        await submit();
        expect(document.body.textContent).toContain("Couldn't save the price.");
        expect(input().value).toBe("456");
        updateService.mockResolvedValue({ ok: true, data: {} });
        const retry = Array.from(document.querySelectorAll("button")).find(
            (b) => b.textContent === "Try again",
        );
        await act(async () => {
            retry?.click();
            await new Promise((r) => setTimeout(r, 0));
        });
        expect(updateService).toHaveBeenLastCalledWith("svc_1", {
            priceCents: 45_600,
        });
        expect(close).toHaveBeenCalled();
    });

    it("without service:write: read-only, who can change it, no field", async () => {
        readServicePrice.mockResolvedValue({
            ok: true,
            data: {
                name: "Sample service",
                priceCents: 12_300,
                currency: "INR",
                durationMinutes: 45,
                canWrite: false,
            },
        });
        await open();
        const text = document.body.textContent;
        expect(text).toMatch(/₹\s?123/);
        expect(text).toContain(
            "Your role can read this price but not change it.",
        );
        expect(text).toContain(
            "An owner or admin can change this in Settings › Team.",
        );
        expect(text).toContain("Where this price shows");
        expect(text).not.toContain("Save price");
        expect(document.querySelector("input")).toBeNull();
        const link = Array.from(document.querySelectorAll("a")).find(
            (a) => a.textContent === "Open in Services",
        );
        expect(link?.getAttribute("href")).toBe("/services/svc_1");
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
