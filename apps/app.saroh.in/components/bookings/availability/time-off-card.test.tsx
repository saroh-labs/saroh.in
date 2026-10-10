// @vitest-environment jsdom
/**
 * Availability's Time off, read first: the lines show with nothing open,
 * and "Add time off" by the heading opens a side sheet with the fields. Its
 * button adds to the screen's draft (the page's Save bar saves it) and
 * closes; a time that can't be added keeps it open with what was chosen;
 * Cancel and Escape drop it, and the keyboard goes back to the button.
 *
 * `react-dom/client` + `act` directly, as the other component tests do. The
 * sheet is the real one; the pickers are drawn as plain fields, since a
 * calendar popover and a Radix select are not what is tested here.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { NewOff } from "@/lib/services/availability-rules";
import type { StaffView } from "@/lib/staff/types";

import { TimeOffCard } from "./time-off-card";

const previewOff = vi.fn();
vi.mock("@/lib/staff/actions", () => ({
    previewOff: (...a: unknown[]) => previewOff(...a) as unknown,
}));
vi.mock("@saroh/ui/date-picker", () => ({
    DatePicker: ({ id, value }: { id: string; value?: Date }) => (
        <output id={id}>{value ? value.getDate() : ""}</output>
    ),
}));
vi.mock("@/components/shared/option-select", () => ({
    OptionSelect: ({
        id,
        value,
        onValueChange,
    }: {
        id: string;
        value: string;
        onValueChange: (v: string) => void;
    }) => (
        <input
            id={id}
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
        />
    ),
}));
vi.mock("./clock-select", () => ({
    ClockSelect: ({
        label,
        value,
        onChange,
    }: {
        label: string;
        value: number;
        onChange: (minute: number) => void;
    }) => (
        <input
            aria-label={label}
            value={String(value)}
            onChange={(e) => onChange(Number(e.target.value))}
        />
    ),
}));

const ASHA: StaffView = {
    id: "st_asha",
    name: "Asha",
    title: null,
    status: "ACTIVE",
    membership: null,
    serviceIds: [],
    hours: [],
    weeklyMinutes: 0,
    extraHours: [],
    timeOff: [],
};

let host: HTMLDivElement;
let root: Root;
const onAdd = vi.fn<(off: Omit<NewOff, "key">) => void>();
const onRemoveNew = vi.fn();

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    onAdd.mockReset();
    onRemoveNew.mockReset();
    previewOff.mockReset();
    previewOff.mockResolvedValue({ ok: true, data: { affected: [] } });
});
afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

function draw(offAdded: NewOff[] = [], canEdit = true) {
    act(() =>
        root.render(
            <TimeOffCard
                me={ASHA}
                closures={[]}
                timezone="Asia/Kolkata"
                today="2026-10-10"
                canEdit={canEdit}
                offAdded={offAdded}
                offRemoved={[]}
                onAdd={onAdd}
                onRemoveSaved={vi.fn()}
                onRemoveNew={onRemoveNew}
            />,
        ),
    );
}

const button = (name: string, within: ParentNode = document) =>
    Array.from(within.querySelectorAll<HTMLButtonElement>("button")).find(
        (b) => b.textContent === name,
    );
const sheet = () => document.querySelector<HTMLElement>('[role="dialog"]');
const sheetName = () => {
    const id = sheet()?.getAttribute("aria-labelledby");
    return id ? document.getElementById(id)?.textContent : undefined;
};
const labelled = (name: string) => {
    const label = Array.from(sheet()?.querySelectorAll("label") ?? []).find(
        (l) => l.textContent.startsWith(name),
    );
    return document.querySelector<HTMLInputElement>(
        `[id="${label?.getAttribute("for") ?? ""}"]`,
    );
};
const named = (name: string) =>
    sheet()?.querySelector<HTMLInputElement>(`[aria-label="${name}"]`) ?? null;

async function settle() {
    await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
    });
}
async function press(el: HTMLElement | null | undefined) {
    await act(async () => {
        el?.click();
        await Promise.resolve();
    });
    await settle();
}
function type(el: HTMLInputElement | null, value: string) {
    act(() => {
        if (!el) return;
        Object.getOwnPropertyDescriptor(
            Object.getPrototypeOf(el) as object,
            "value",
        )?.set?.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
    });
}

describe("Time off, read first", () => {
    it("shows the lines with nothing open and no field on the page", () => {
        draw([
            {
                key: "k1",
                staffId: "st_asha",
                fromDate: "2026-10-12",
                toDate: "2026-10-12",
                startMinute: null,
                endMinute: null,
                reason: "Dentist",
            },
        ]);
        expect(host.textContent).toContain("Time off");
        expect(host.textContent).toContain("Dentist · not saved yet");
        expect(button("Add time off", host)).toBeDefined();
        expect(sheet()).toBeNull();
        expect(host.querySelector("input, textarea, form")).toBeNull();
        expect(previewOff).not.toHaveBeenCalled();
    });

    it("says none are booked, and still offers the button", () => {
        draw();
        expect(host.textContent).toContain("None booked.");
        expect(button("Add time off", host)).toBeDefined();
    });

    it("offers no button to a role that can't change it", () => {
        draw([], false);
        expect(button("Add time off", host)).toBeUndefined();
    });

    it("still removes a line that isn't saved yet", async () => {
        draw([
            {
                key: "k1",
                staffId: "st_asha",
                fromDate: "2026-10-12",
                toDate: "2026-10-12",
                startMinute: null,
                endMinute: null,
                reason: "",
            },
        ]);
        await press(
            host.querySelector<HTMLButtonElement>(
                '[aria-label="Remove this time off"]',
            ),
        );
        expect(onRemoveNew).toHaveBeenCalledWith("k1");
    });
});

describe("Add time off", () => {
    it("opens a sheet of that name, which says it isn't saved until Save changes", async () => {
        draw();
        await press(button("Add time off", host));
        expect(sheetName()).toBe("Add time off");
        expect(sheet()?.textContent).toContain("until you press Save changes");
        expect(button("Add day off", sheet() ?? undefined)).toBeDefined();
        expect(button("Cancel", sheet() ?? undefined)).toBeDefined();
        expect(onAdd).not.toHaveBeenCalled();
    });

    it("adds to the draft and closes, back on the button", async () => {
        draw();
        await press(button("Add time off", host));
        type(labelled("Reason"), "  Dentist ");
        await press(button("Add day off", sheet() ?? undefined));
        expect(onAdd).toHaveBeenCalledWith({
            staffId: "st_asha",
            fromDate: "2026-10-11",
            toDate: "2026-10-11",
            startMinute: null,
            endMinute: null,
            reason: "Dentist",
        });
        expect(sheet()).toBeNull();
        expect(document.activeElement).toBe(button("Add time off", host));
    });

    it("closes the business for everyone with the reason Closed", async () => {
        draw();
        await press(button("Add time off", host));
        type(labelled("Who"), "all");
        await press(button("Close that day", sheet() ?? undefined));
        expect(onAdd).toHaveBeenCalledWith(
            expect.objectContaining({ staffId: null, reason: "Closed" }),
        );
    });

    it("keeps the sheet open, with what was chosen, when the end is before the start", async () => {
        draw();
        await press(button("Add time off", host));
        type(labelled("Reason"), "Dentist");
        type(labelled("When"), "hours");
        type(named("Until"), "600");
        const add = button("Add time off", sheet() ?? undefined);
        expect(add?.disabled).toBe(true);
        expect(sheet()?.querySelector('[role="alert"]')?.textContent).toBe(
            "The end has to be after the start.",
        );
        await press(add);
        // Enter in a field goes the same way as the button.
        act(() => {
            sheet()
                ?.querySelector("form")
                ?.dispatchEvent(
                    new Event("submit", { bubbles: true, cancelable: true }),
                );
        });
        expect(onAdd).not.toHaveBeenCalled();
        expect(sheetName()).toBe("Add time off");
        expect(labelled("Reason")?.value).toBe("Dentist");

        // Put right, it adds part of the day.
        type(named("Until"), "900");
        await press(button("Add time off", sheet() ?? undefined));
        expect(onAdd).toHaveBeenCalledWith(
            expect.objectContaining({ startMinute: 780, endMinute: 900 }),
        );
        expect(sheet()).toBeNull();
    });

    it("drops what was typed on Cancel and on Escape, and starts fresh", async () => {
        draw();
        await press(button("Add time off", host));
        type(labelled("Reason"), "Dentist");
        await press(button("Cancel", sheet() ?? undefined));
        expect(sheet()).toBeNull();
        expect(onAdd).not.toHaveBeenCalled();
        expect(document.activeElement).toBe(button("Add time off", host));

        await press(button("Add time off", host));
        expect(labelled("Reason")?.value).toBe("");
        type(labelled("Reason"), "Holiday");
        await act(async () => {
            document.activeElement?.dispatchEvent(
                new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
            );
            await Promise.resolve();
        });
        await settle();
        expect(sheet()).toBeNull();
        expect(onAdd).not.toHaveBeenCalled();
    });

    it("says how many bookings fall in that time, and that they are kept", async () => {
        previewOff.mockResolvedValue({
            ok: true,
            data: { affected: [{}, {}] },
        });
        draw();
        await press(button("Add time off", host));
        await act(async () => {
            await new Promise((r) => setTimeout(r, 300));
        });
        expect(previewOff).toHaveBeenCalledWith({
            fromDate: "2026-10-11",
            toDate: "2026-10-11",
            staffId: "st_asha",
        });
        expect(sheet()?.textContent).toContain(
            "2 bookings fall in this time. They're kept. Move or cancel them from the calendar.",
        );
    });
});
