// @vitest-environment jsdom
/**
 * The GST rate ask, in place (12 Oct 2026): an action the API refuses
 * because an item on the paper has no GST rate opens the sheet with one row
 * per item, saves each rate (to the service or product, or to the invoice
 * for a typed line) and runs the same action again, its result returned as
 * if nothing had stood in the way. Cancel answers null; any other failure
 * passes straight through.
 *
 * `react-dom/client` + `act` directly, as the other component tests do.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RateItem } from "@/lib/gst-rates/missing";

import { useGstRateStep } from "./use-gst-rate-step";

const saveGstRates = vi.fn();
vi.mock("@/lib/gst-rates/actions", () => ({
    saveGstRates: (...args: unknown[]) => saveGstRates(...args) as unknown,
}));

// The product's select opens a portal jsdom can't press: a native select
// stands in, with the same options, placeholder and wiring.
vi.mock("@saroh/ui/option-select", () => ({
    OptionSelect: ({
        id,
        value,
        onValueChange,
        options,
        placeholder,
        disabled,
        ...aria
    }: {
        id?: string;
        value: string;
        onValueChange: (v: string) => void;
        options: { value: string; label: string }[];
        placeholder?: string;
        disabled?: boolean;
        "aria-label"?: string;
        "aria-invalid"?: boolean;
    }) => (
        <select
            id={id}
            aria-label={aria["aria-label"]}
            aria-invalid={aria["aria-invalid"]}
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

type Outcome =
    | { ok: true; data: { number: string } }
    | { ok: false; error: string; rates?: RateItem[] };

let root: Root;
let host: HTMLDivElement;
let result: Outcome | null | undefined;
const action = vi.fn<() => Promise<Outcome | null>>();
const saveLines = vi.fn();

function Harness({ withLines = false }: { withLines?: boolean }) {
    const rates = useGstRateStep({
        then: "take this payment",
        continueLabel: "Save and take payment",
        ...(withLines
            ? {
                  saveLines: (chosen: Readonly<Record<number, string>>) =>
                      saveLines(chosen) as Promise<{ ok: true }>,
              }
            : {}),
    });
    return (
        <>
            <button
                type="button"
                onClick={() => {
                    void rates.run(action).then((r) => {
                        result = r;
                    });
                }}
            >
                Take payment
            </button>
            {rates.step}
        </>
    );
}

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    result = undefined;
    for (const fn of [action, saveGstRates, saveLines]) fn.mockReset();
    saveGstRates.mockResolvedValue({ ok: true, data: { saved: 1 } });
    saveLines.mockResolvedValue({ ok: true });
    act(() => root.render(<Harness />));
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

function rateBox(name: string): HTMLSelectElement {
    const box = sheet()?.querySelector<HTMLSelectElement>(
        `select[aria-label="GST rate for ${name}"]`,
    );
    if (!box) throw new Error(`No GST rate box for ${name}`);
    return box;
}

function choose(name: string, rate: string) {
    const box = rateBox(name);
    act(() => {
        Object.getOwnPropertyDescriptor(
            HTMLSelectElement.prototype,
            "value",
        )?.set?.call(box, rate);
        box.dispatchEvent(new Event("change", { bubbles: true }));
    });
}

const PT: RateItem = {
    kind: "SERVICE",
    id: "svc_pt",
    name: "Personal Training",
};
const SERUM: RateItem = {
    kind: "PRODUCT",
    id: "prod_1",
    name: "Vitamin C serum",
};
const refused = (...rates: RateItem[]): Outcome => ({
    ok: false,
    error: "Personal Training has no GST rate. Choose one to issue this invoice.",
    rates,
});
const DONE: Outcome = { ok: true, data: { number: "RC/26-27/0007" } };

describe("the GST rate ask", () => {
    it("asks for the rate where the payment was taken, saves it to the service, and carries on", async () => {
        action.mockResolvedValueOnce(refused(PT)).mockResolvedValueOnce(DONE);
        await press("Take payment");

        const text = sheet()?.textContent ?? "";
        expect(text).toContain("Choose a GST rate");
        expect(text).toContain(
            "Personal Training has no GST rate. Choose one to take this payment.",
        );
        expect(text).toContain(
            "The rate is saved on the service, so you're asked once.",
        );
        // The box starts on its placeholder: nothing is chosen for them.
        expect(rateBox("Personal Training").value).toBe("");

        choose("Personal Training", "18");
        await press("Save and take payment");

        expect(saveGstRates).toHaveBeenCalledWith([
            { kind: "SERVICE", id: "svc_pt", rate: "18" },
        ]);
        expect(action).toHaveBeenCalledTimes(2);
        expect(result).toEqual(DONE);
        expect(sheet()).toBeNull();
    });

    it("won't go on until every row is answered, and says so on the row", async () => {
        action.mockResolvedValue(refused(PT, SERUM));
        await press("Take payment");
        expect(sheet()?.textContent).toContain("Choose GST rates");
        expect(sheet()?.textContent).toContain(
            "2 items have no GST rate. Choose one for each to take this payment.",
        );

        choose("Personal Training", "18");
        await press("Save and take payment");

        expect(saveGstRates).not.toHaveBeenCalled();
        expect(action).toHaveBeenCalledTimes(1);
        expect(rateBox("Vitamin C serum").getAttribute("aria-invalid")).toBe(
            "true",
        );
        expect(
            rateBox("Personal Training").getAttribute("aria-invalid"),
        ).toBeNull();
        expect(sheet()?.textContent).toContain(
            "Choose a GST rate. Pick 0% if it's exempt or nil-rated.",
        );
    });

    it("takes 0% as an answer: exempt is a rate somebody chose", async () => {
        action
            .mockResolvedValueOnce(refused(PT, SERUM))
            .mockResolvedValueOnce(DONE);
        await press("Take payment");
        choose("Personal Training", "0");
        choose("Vitamin C serum", "5");
        await press("Save and take payment");

        expect(saveGstRates).toHaveBeenCalledWith([
            { kind: "SERVICE", id: "svc_pt", rate: "0" },
            { kind: "PRODUCT", id: "prod_1", rate: "5" },
        ]);
        expect(result).toEqual(DONE);
    });

    it("keeps a refused save in the sheet, with what was chosen, and doesn't run the action again", async () => {
        action.mockResolvedValue(refused(PT));
        saveGstRates.mockResolvedValue({
            ok: false,
            error: "Your role can't change services.",
        });
        await press("Take payment");
        choose("Personal Training", "18");
        await press("Save and take payment");

        expect(sheet()?.textContent).toContain(
            "Your role can't change services.",
        );
        expect(rateBox("Personal Training").value).toBe("18");
        expect(action).toHaveBeenCalledTimes(1);
        expect(result).toBeUndefined();
    });

    it("Cancel closes it and answers null: nothing was taken, nothing to report", async () => {
        action.mockResolvedValue(refused(PT));
        await press("Take payment");
        await press("Cancel");
        expect(result).toBeNull();
        expect(saveGstRates).not.toHaveBeenCalled();
        expect(action).toHaveBeenCalledTimes(1);
        expect(sheet()).toBeNull();
    });

    it("passes any other outcome straight through, with no sheet", async () => {
        action.mockResolvedValue({
            ok: false,
            error: "This booking is already paid.",
        });
        await press("Take payment");
        expect(sheet()).toBeNull();
        expect(result).toEqual({
            ok: false,
            error: "This booking is already paid.",
        });
    });

    it("passes on an action that answered null itself: another step was closed", async () => {
        action.mockResolvedValue(null);
        await press("Take payment");
        expect(sheet()).toBeNull();
        expect(result).toBeNull();
    });

    it("writes a typed line's rate to its invoice, by its place", async () => {
        act(() => root.render(<Harness withLines />));
        action
            .mockResolvedValueOnce(
                refused({ kind: "LINE", id: "2", name: "Catering, Saturday" }),
            )
            .mockResolvedValueOnce(DONE);
        await press("Take payment");
        expect(sheet()?.textContent).toContain(
            "The rate is saved on this invoice.",
        );
        choose("Catering, Saturday", "5");
        await press("Save and take payment");

        expect(saveLines).toHaveBeenCalledWith({ 2: "5" });
        expect(saveGstRates).not.toHaveBeenCalled();
        expect(result).toEqual(DONE);
    });
});
