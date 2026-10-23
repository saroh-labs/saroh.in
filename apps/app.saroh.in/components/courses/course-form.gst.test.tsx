// @vitest-environment jsdom
/**
 * The course form's GST (12 Oct 2026): a GST-registered business answers
 * the rate with the price, as on a service (required for a priced course,
 * 0% for an exempt one, the quiet "GST on this price" and an optional SAC
 * code), and a save sends them as the API takes them. A business that isn't
 * registered is shown none of it, sends none of it and is never held up.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    pickRate,
    rateGroup,
    ratePicker,
    rateShown,
    ratesOffered,
} from "@/components/shared/fields/gst-rate-picker.testing";

import type { CourseDetail } from "@/lib/courses/service";

import { CourseForm } from "./course-form";

const push = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn() }),
}));
const actions = vi.hoisted(() => ({
    createCourse: vi.fn(),
    updateCourse: vi.fn(),
}));
vi.mock("@/lib/courses/actions", () => actions);
vi.mock("@saroh/ui/toast", async (importOriginal) => ({
    ...(await importOriginal<object>()),
    showSuccess: vi.fn(),
    showError: vi.fn(),
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
        "aria-invalid"?: boolean;
        "aria-describedby"?: string;
    }) => (
        <select
            id={id}
            aria-invalid={aria["aria-invalid"]}
            aria-describedby={aria["aria-describedby"]}
            value={value}
            disabled={disabled}
            onChange={(e) => onValueChange(e.target.value)}
        >
            {placeholder ? <option value="">{placeholder}</option> : null}
            {options.map((o) => (
                <option key={o.value} value={o.value}>
                    {o.label}
                </option>
            ))}
        </select>
    ),
}));

const SERVICES = [
    {
        id: "svc_1",
        name: "Pottery",
        capacity: 8,
        durationMinutes: 90,
        timezone: "Asia/Kolkata",
        currency: "INR",
    },
];

const COURSE = {
    id: "crs_1",
    name: "Wheel throwing",
    description: "",
    price: "5000",
    currency: "INR",
    seats: 6,
    service: { id: "svc_1", name: "Pottery", capacity: 8 },
    gstRate: null,
    sacCode: null,
    gstPriceMode: null,
} as unknown as CourseDetail;

interface Gst {
    asked: boolean;
    priceMode: "INCLUDED" | "ADDED" | null;
}
const ASKED: Gst = { asked: true, priceMode: "INCLUDED" };

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    push.mockReset();
    actions.createCourse.mockReset();
    actions.updateCourse.mockReset().mockResolvedValue({
        ok: true,
        data: { id: "crs_1" },
    });
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
});

function render(course: CourseDetail, gst?: Gst) {
    act(() =>
        root.render(
            <CourseForm
                services={SERVICES}
                course={course}
                defaultCurrency="INR"
                gst={gst}
            />,
        ),
    );
}

const text = () => host.textContent;

function control(label: string): HTMLElement {
    const l = Array.from(host.querySelectorAll("label")).find((x) =>
        x.textContent.trim().startsWith(label),
    );
    const el = l && document.getElementById(l.htmlFor);
    if (!el) throw new Error(`No field ${label}`);
    return el;
}

/** The GST rate's buttons (DEC-176), and their main row. */
const rate = () => ratePicker("GST rate", host);
const rateRow = () => rateGroup(rate());

function pick(label: string, value: string) {
    const box = control(label);
    act(() => {
        Object.getOwnPropertyDescriptor(
            HTMLSelectElement.prototype,
            "value",
        )?.set?.call(box, value);
        box.dispatchEvent(new Event("change", { bubbles: true }));
    });
}

function type(label: string, value: string) {
    const input = control(label);
    act(() => {
        Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value",
        )?.set?.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
    });
}

async function save() {
    const button = Array.from(host.querySelectorAll("button")).find(
        (b) => b.textContent.trim() === "Save",
    );
    if (!button) throw new Error("No Save");
    await act(async () => {
        button.click();
        await Promise.resolve();
    });
    for (let i = 0; i < 8; i++) {
        await act(async () => {
            await new Promise((r) => setTimeout(r, 0));
        });
    }
}

describe("the course form's GST", () => {
    it("shows a business that isn't registered none of it, and saves without it", async () => {
        render(COURSE);
        expect(text()).not.toContain("GST");
        expect(text()).not.toContain("SAC code");

        await save();
        expect(actions.updateCourse).toHaveBeenCalledWith("crs_1", {
            name: "Wheel throwing",
            description: null,
            price: "5000",
            currency: "INR",
            seats: 6,
        });
    });

    it("asks a registered business for the rate, with the quiet select and the SAC code", () => {
        render(COURSE, ASKED);
        // The rates as buttons (DEC-176): none pressed, no "Not set".
        expect(rateShown(rate())).toBe("");
        expect(ratesOffered(rate())).toEqual(["0", "5", "18", "40"]);
        expect(
            Array.from(
                (control("GST on this price") as HTMLSelectElement).options,
            ).map((o) => o.textContent),
        ).toEqual([
            "Same as the business (includes GST)",
            "Includes GST",
            "GST is added",
        ]);
        expect(text()).toContain("SAC code (optional)");
    });

    it("won't save a priced course with no rate, and says so beside the field", async () => {
        render(COURSE, ASKED);
        await save();
        expect(actions.updateCourse).not.toHaveBeenCalled();
        expect(rateRow().getAttribute("aria-invalid")).toBe("true");
        expect(text()).toContain(
            "Choose a GST rate. Pick 0% if it's exempt or nil-rated.",
        );
    });

    it("says the rate with every other problem, in one pass", async () => {
        render(COURSE, ASKED);
        type("Name", "");
        await save();
        expect(actions.updateCourse).not.toHaveBeenCalled();
        expect(text()).toContain("Give the course a name");
        expect(text()).toContain(
            "Choose a GST rate. Pick 0% if it's exempt or nil-rated.",
        );
    });

    it("saves the rate, the way and the SAC code as the API takes them", async () => {
        render(COURSE, ASKED);
        pickRate(rate(), "18");
        pick("GST on this price", "ADDED");
        type("SAC code", "9992 93");
        await save();
        expect(actions.updateCourse).toHaveBeenCalledWith("crs_1", {
            name: "Wheel throwing",
            description: null,
            price: "5000",
            currency: "INR",
            seats: 6,
            gstRate: "18",
            sacCode: "999293",
            gstPriceMode: "ADDED",
        });
    });

    it("takes exempt (0%), and sends null for the same as the business and no SAC code", async () => {
        render(COURSE, ASKED);
        pickRate(rate(), "0");
        await save();
        expect(actions.updateCourse).toHaveBeenCalledWith(
            "crs_1",
            expect.objectContaining({
                gstRate: "0",
                sacCode: null,
                gstPriceMode: null,
            }),
        );
    });

    it("won't save a SAC code that isn't four to eight digits", async () => {
        render(COURSE, ASKED);
        pickRate(rate(), "18");
        type("SAC code", "99");
        await save();
        expect(actions.updateCourse).not.toHaveBeenCalled();
        expect(text()).toContain("A SAC code is 4 to 8 digits.");
    });

    it("opens a saved course on its own rate and way", () => {
        render(
            {
                ...COURSE,
                gstRate: "18",
                sacCode: "999293",
                gstPriceMode: "ADDED",
            },
            ASKED,
        );
        expect(rateShown(rate())).toBe("18");
        expect((control("GST on this price") as HTMLSelectElement).value).toBe(
            "ADDED",
        );
        expect((control("SAC code") as HTMLInputElement).value).toBe("999293");
        expect(text()).toContain("The rate added on top of the price.");
    });

    it("clears a rate's problem as soon as one is chosen", async () => {
        render(COURSE, ASKED);
        await save();
        expect(rateRow().getAttribute("aria-invalid")).toBe("true");
        pickRate(rate(), "5");
        for (let i = 0; i < 6; i++) {
            await act(async () => {
                await new Promise((r) => setTimeout(r, 0));
            });
        }
        expect(rateRow().getAttribute("aria-invalid")).not.toBe("true");
        expect(text()).not.toContain("Choose a GST rate");
    });
});
