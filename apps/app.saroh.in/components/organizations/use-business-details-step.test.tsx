// @vitest-environment jsdom
/**
 * "Add your business details" in place (DEC-068): an action the API refuses
 * for want of the registered address opens the step, which reads what is on
 * file, asks for what is missing, saves it to the business profile and runs
 * the action again — its result returned as if nothing had stood in the
 * way. "Not now" answers null; any other failure passes straight through.
 *
 * `react-dom/client` + `act` directly, as the other component tests do.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { OrganizationSettings } from "@/lib/organizations/settings-service";

import { useBusinessDetailsStep } from "./use-business-details-step";

const readBusinessDetails = vi.fn();
const saveOrganizationSettings = vi.fn();
vi.mock("@/lib/organizations/settings-actions", () => ({
    readBusinessDetails: (...args: unknown[]) =>
        readBusinessDetails(...args) as unknown,
    saveOrganizationSettings: (...args: unknown[]) =>
        saveOrganizationSettings(...args) as unknown,
}));

type Outcome =
    | { ok: true; data: { number: string } }
    | { ok: false; error: string; missing?: ("address" | "gstin")[] };

let root: Root;
let host: HTMLDivElement;
let result: Outcome | null | undefined;
const action = vi.fn<() => Promise<Outcome>>();

function Harness() {
    const details = useBusinessDetailsStep({
        then: "issue it",
        continueLabel: "Save and issue",
    });
    return (
        <>
            <button
                type="button"
                onClick={() => {
                    void details.run(action).then((r) => {
                        result = r;
                    });
                }}
            >
                Issue it
            </button>
            {details.step}
        </>
    );
}

const SETTINGS: OrganizationSettings = {
    id: "org_1",
    name: "Hill Road Bakes",
    slug: "hill-road",
    profile: {
        legalName: null,
        type: null,
        country: "IN",
        taxId: null,
        contactEmail: null,
        website: null,
    },
    tradingSince: null,
    tax: {
        registered: false,
        state: "29",
        stateName: "Karnataka",
        invoicePrefix: null,
        deliveryRate: "18",
        deliverySac: null,
    },
    registeredAddress: {
        line1: null,
        line2: null,
        city: null,
        postalCode: null,
        state: "29",
        stateName: "Karnataka",
    },
};

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    // The GST switch measures itself; jsdom has no ResizeObserver.
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
        observe() {
            // Nothing to measure in jsdom.
        }
        unobserve() {
            // Nothing observed.
        }
        disconnect() {
            // Nothing observed.
        }
    };
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    result = undefined;
    for (const fn of [action, readBusinessDetails, saveOrganizationSettings]) {
        fn.mockReset();
    }
    readBusinessDetails.mockResolvedValue({ ok: true, data: SETTINGS });
    saveOrganizationSettings.mockResolvedValue({ ok: true, data: SETTINGS });
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

function byLabel(label: string): HTMLInputElement {
    const lab = Array.from(sheet()?.querySelectorAll("label") ?? []).find(
        (l) => l.textContent.trim() === label,
    );
    const id = lab?.getAttribute("for");
    const el = id ? document.getElementById(id) : null;
    if (!el) throw new Error(`No field labelled ${label}`);
    return el as HTMLInputElement;
}

function button(name: string): HTMLButtonElement {
    const hit = Array.from(document.querySelectorAll("button")).find(
        (b) => b.textContent.trim() === name,
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

async function press(name: string) {
    await act(async () => {
        button(name).click();
        await Promise.resolve();
    });
    await settle();
}

const REFUSED: Outcome = {
    ok: false,
    error: "Add your registered address first. Every invoice prints it.",
    missing: ["address"],
};

describe("the business-details step (DEC-068)", () => {
    it("asks for the address, saves it, and carries on with the action", async () => {
        action
            .mockResolvedValueOnce(REFUSED)
            .mockResolvedValueOnce({ ok: true, data: { number: "RC-0001" } });
        await press("Issue it");

        expect(sheet()?.textContent).toContain("Add your business details");
        expect(sheet()?.textContent).toContain(
            "Every invoice prints your registered address. Add it once and we'll issue it.",
        );
        typeInto(byLabel("Address line 1"), "3 Hill Road");
        typeInto(byLabel("City"), "Bengaluru");
        typeInto(byLabel("PIN code"), "560038");
        await press("Save and issue");

        expect(saveOrganizationSettings).toHaveBeenCalledWith({
            registeredAddress: {
                line1: "3 Hill Road",
                line2: "",
                city: "Bengaluru",
                postalCode: "560038",
            },
            tax: { state: "29" },
        });
        expect(action).toHaveBeenCalledTimes(2);
        expect(result).toEqual({ ok: true, data: { number: "RC-0001" } });
        expect(sheet()).toBeNull();
    });

    it("says what is missing on the field, and saves nothing", async () => {
        action.mockResolvedValue(REFUSED);
        await press("Issue it");
        typeInto(byLabel("PIN code"), "56003");
        await press("Save and issue");

        const t = sheet()?.textContent ?? "";
        expect(t).toContain("Add the first line of your address.");
        expect(t).toContain("Add the city.");
        expect(t).toContain("A PIN code is six digits, like 560038.");
        expect(saveOrganizationSettings).not.toHaveBeenCalled();
        expect(action).toHaveBeenCalledTimes(1);
    });

    it("asks a registered business for its GSTIN, and sends its state", async () => {
        readBusinessDetails.mockResolvedValue({
            ok: true,
            data: {
                ...SETTINGS,
                tax: { ...SETTINGS.tax, registered: true },
                registeredAddress: {
                    ...SETTINGS.registeredAddress,
                    line1: "3 Hill Road",
                    city: "Bengaluru",
                    postalCode: "560038",
                },
            },
        });
        action
            .mockResolvedValueOnce({ ...REFUSED, missing: ["gstin"] })
            .mockResolvedValueOnce({
                ok: true,
                data: { number: "RC/26-27/1" },
            });
        await press("Issue it");
        expect(sheet()?.textContent).toContain(
            "Every invoice prints your GSTIN.",
        );
        typeInto(byLabel("GSTIN"), "29aagcr4375j1zu");
        await press("Save and issue");

        expect(saveOrganizationSettings).toHaveBeenCalledWith(
            expect.objectContaining({
                // Still registered: the registration isn't re-sent.
                tax: { state: "29" },
                profile: { taxId: "29AAGCR4375J1ZU" },
            }),
        );
        expect(result).toEqual({ ok: true, data: { number: "RC/26-27/1" } });
    });

    it("keeps a refusal of the save in the sheet, on its field", async () => {
        action.mockResolvedValue(REFUSED);
        saveOrganizationSettings.mockResolvedValue({
            ok: false,
            error: "A PIN code is six digits, like 560038.",
            field: "postalCode",
        });
        await press("Issue it");
        typeInto(byLabel("Address line 1"), "3 Hill Road");
        typeInto(byLabel("City"), "Bengaluru");
        typeInto(byLabel("PIN code"), "560038");
        await press("Save and issue");
        expect(sheet()?.textContent).toContain(
            "A PIN code is six digits, like 560038.",
        );
        expect(action).toHaveBeenCalledTimes(1);
    });

    it("Not now closes it and answers null: nothing to report", async () => {
        action.mockResolvedValue(REFUSED);
        await press("Issue it");
        await press("Not now");
        expect(result).toBeNull();
        expect(action).toHaveBeenCalledTimes(1);
        expect(sheet()).toBeNull();
    });

    it("tells a role that can't add them who can", async () => {
        action.mockResolvedValue(REFUSED);
        readBusinessDetails.mockResolvedValue({
            ok: false,
            error: "Forbidden",
            forbidden: true,
        });
        await press("Issue it");
        expect(sheet()?.textContent).toContain(
            "Only an owner or an admin can add these.",
        );
        await press("Close");
        expect(result).toBeNull();
    });

    it("speaks in the kind's words: Just me adds 'your details' (DEC-070)", async () => {
        for (const kind of ["SOLO", "WORK"] as const) {
            readBusinessDetails.mockResolvedValue({
                ok: true,
                data: { ...SETTINGS, kind },
            });
            action.mockResolvedValue(REFUSED);
            await press("Issue it");
            const t = sheet()?.textContent ?? "";
            expect(t, kind).toContain("Add your details");
            expect(t, kind).not.toContain("business details");
            expect(t, kind).toContain(
                "Every invoice prints your address. Add it once and we'll issue it.",
            );
            await press("Not now");
        }
    });

    it("keeps a business's words, and an older API's with no kind", async () => {
        for (const kind of ["BUSINESS", undefined] as const) {
            readBusinessDetails.mockResolvedValue({
                ok: true,
                data: { ...SETTINGS, kind },
            });
            action.mockResolvedValue({
                ...REFUSED,
                missing: ["address", "gstin"],
            });
            await press("Issue it");
            const t = sheet()?.textContent ?? "";
            expect(t).toContain("Add your business details");
            expect(t).toContain(
                "Every invoice prints your registered address and GSTIN. Add them once and we'll issue it.",
            );
            await press("Not now");
        }
    });

    it("passes any other outcome straight through, with no sheet", async () => {
        action.mockResolvedValue({
            ok: false,
            error: "The due date has passed.",
        });
        await press("Issue it");
        expect(sheet()).toBeNull();
        expect(result).toEqual({
            ok: false,
            error: "The due date has passed.",
        });
        expect(readBusinessDetails).not.toHaveBeenCalled();
    });
});
