// @vitest-environment jsdom
/**
 * The missing GST rates notice (12 Oct 2026): one quiet line with a count
 * for a GST-registered business, and the sheet where each rate is chosen in
 * its row. Nothing is drawn when nothing is missing.
 *
 * `react-dom/client` + `act` directly, as the other component tests do.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MissingRates } from "@/lib/gst-rates/missing";

import { MissingRatesNotice } from "./missing-rates-notice";

const saveGstRates = vi.fn();
vi.mock("@/lib/gst-rates/actions", () => ({
    saveGstRates: (...args: unknown[]) => saveGstRates(...args) as unknown,
}));

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh, push: vi.fn() }),
}));

const showSuccess = vi.fn();
vi.mock("@saroh/ui/toast", () => ({
    showSuccess: (...args: unknown[]) => showSuccess(...args) as unknown,
    showError: vi.fn(),
}));

// A native select stands in for the product's, which opens a portal.
vi.mock("@saroh/ui/option-select", () => ({
    OptionSelect: ({
        value,
        onValueChange,
        options,
        placeholder,
        disabled,
        ...aria
    }: {
        value: string;
        onValueChange: (v: string) => void;
        options: { value: string; label: string }[];
        placeholder?: string;
        disabled?: boolean;
        "aria-label"?: string;
    }) => (
        <select
            aria-label={aria["aria-label"]}
            value={value}
            disabled={disabled}
            onChange={(e) => onValueChange(e.target.value)}
        >
            <option value="">{placeholder}</option>
            {options.map((o) => (
                <option key={o.value} value={o.value}>
                    {o.label}
                </option>
            ))}
        </select>
    ),
}));

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    for (const fn of [saveGstRates, refresh, showSuccess]) fn.mockReset();
    saveGstRates.mockResolvedValue({ ok: true, data: { saved: 1 } });
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
});

async function settle() {
    for (let i = 0; i < 5; i++) {
        await act(async () => {
            await new Promise((r) => setTimeout(r, 0));
        });
    }
}

const MISSING: MissingRates = {
    registered: true,
    more: false,
    items: [
        {
            kind: "SERVICE",
            id: "svc_pt",
            name: "Personal Training",
            priceCents: 150_000,
            currency: "INR",
            canSet: true,
        },
        {
            kind: "PRODUCT",
            id: "prod_1",
            name: "Vitamin C serum",
            priceCents: 54_900,
            currency: "INR",
            canSet: true,
        },
    ],
};

const show = (missing: MissingRates | null) =>
    act(() => root.render(<MissingRatesNotice missing={missing} />));

const sheet = () => document.querySelector<HTMLElement>('[role="dialog"]');

function button(name: string): HTMLButtonElement {
    const hit = Array.from(document.querySelectorAll("button")).find(
        (b) => b.textContent.trim() === name,
    );
    if (!hit) throw new Error(`No button ${name}`);
    return hit;
}

async function press(name: string) {
    await act(async () => {
        button(name).click();
        await Promise.resolve();
    });
    await settle();
}

function choose(name: string, rate: string) {
    const box = sheet()?.querySelector<HTMLSelectElement>(
        `select[aria-label="GST rate for ${name}"]`,
    );
    if (!box) throw new Error(`No GST rate box for ${name}`);
    act(() => {
        Object.getOwnPropertyDescriptor(
            HTMLSelectElement.prototype,
            "value",
        )?.set?.call(box, rate);
        box.dispatchEvent(new Event("change", { bubbles: true }));
    });
}

describe("the missing GST rates notice", () => {
    it("draws nothing when nothing is missing, unregistered, or unread", () => {
        show(null);
        expect(host.textContent).toBe("");
        show({ registered: true, items: [], more: false });
        expect(host.textContent).toBe("");
        show({ ...MISSING, registered: false });
        expect(host.textContent).toBe("");
    });

    it("says how many, by kind, as a quiet note with one button", () => {
        show(MISSING);
        const note = host.querySelector('[role="note"]');
        expect(note?.textContent).toContain(
            "1 service and 1 product have no GST rate. Until you choose one, their tax invoices show no GST.",
        );
        expect(button("Choose rates")).toBeTruthy();
        // Nothing is open until it is asked for.
        expect(sheet()).toBeNull();
    });

    it("opens a sheet with a row each, read first: its kind and its price", async () => {
        show(MISSING);
        await press("Choose rates");
        const text = sheet()?.textContent ?? "";
        expect(text).toContain("GST rates to choose");
        expect(text).toContain("Personal Training");
        expect(text).toContain("Service · ₹1,500");
        expect(text).toContain("Vitamin C serum");
        expect(text).toContain("Product · ₹549");
    });

    it("says how the prices carry GST as the business chose, and neither way when that wasn't read", async () => {
        show({ ...MISSING, priceMode: "ADDED" });
        await press("Choose rates");
        expect(sheet()?.textContent).toContain(
            "GST is added to your prices. Choose 0% for anything exempt or nil-rated.",
        );
        expect(sheet()?.textContent).toContain(
            "Choose the rate added to each price.",
        );
        expect(sheet()?.textContent).not.toContain("Prices include GST");
        await press("Cancel");

        show({ ...MISSING, priceMode: "INCLUDED" });
        await press("Choose rates");
        expect(sheet()?.textContent).toContain(
            "Prices include GST. Choose 0% for anything exempt or nil-rated.",
        );
        expect(sheet()?.textContent).toContain(
            "Choose the rate each price includes.",
        );
        await press("Cancel");

        show(MISSING);
        await press("Choose rates");
        expect(sheet()?.textContent).toContain(
            "Choose 0% for anything exempt or nil-rated.",
        );
        expect(sheet()?.textContent).not.toContain("Prices include GST");
        expect(sheet()?.textContent).not.toContain("GST is added");
    });

    it("saves the rows that were answered, says so, and reads the page again", async () => {
        show(MISSING);
        await press("Choose rates");
        choose("Vitamin C serum", "0");
        await press("Save");

        // Only the one chosen: the other stays on the list for next time.
        expect(saveGstRates).toHaveBeenCalledWith([
            { kind: "PRODUCT", id: "prod_1", rate: "0" },
        ]);
        expect(showSuccess).toHaveBeenCalledWith("GST rate saved.");
        expect(refresh).toHaveBeenCalled();
        expect(sheet()).toBeNull();
    });

    it("one rate for all fills every row, and a row can still differ", async () => {
        show(MISSING);
        await press("Choose rates");
        choose("all of these", "18");
        choose("Vitamin C serum", "5");
        await press("Save");

        expect(saveGstRates).toHaveBeenCalledWith([
            { kind: "SERVICE", id: "svc_pt", rate: "18" },
            { kind: "PRODUCT", id: "prod_1", rate: "5" },
        ]);
    });

    it("Save with nothing chosen just closes: there is nothing to save", async () => {
        show(MISSING);
        await press("Choose rates");
        await press("Save");
        expect(saveGstRates).not.toHaveBeenCalled();
        expect(showSuccess).not.toHaveBeenCalled();
        expect(sheet()).toBeNull();
    });

    it("keeps a refused save in the sheet", async () => {
        saveGstRates.mockResolvedValue({
            ok: false,
            error: "Couldn't save the GST rate.",
        });
        show(MISSING);
        await press("Choose rates");
        choose("Personal Training", "18");
        await press("Save");
        expect(sheet()?.textContent).toContain("Couldn't save the GST rate.");
        expect(refresh).not.toHaveBeenCalled();
    });

    it("gives someone who can set none of them the line, and no button", () => {
        show({
            ...MISSING,
            items: MISSING.items.map((item) => ({ ...item, canSet: false })),
        });
        expect(host.textContent).toContain("have no GST rate");
        expect(host.querySelector("button")).toBeNull();
    });

    it("tells someone who can set only some which they can't, and who can", async () => {
        show({
            ...MISSING,
            items: [MISSING.items[0], { ...MISSING.items[1], canSet: false }],
        });
        await press("Choose rates");
        expect(sheet()?.textContent).toContain(
            "Your role can't set some of these. An owner or admin can change this in Settings › Team.",
        );
        const locked = sheet()?.querySelector<HTMLSelectElement>(
            'select[aria-label="GST rate for Vitamin C serum"]',
        );
        expect(locked?.disabled).toBe(true);
    });
});
