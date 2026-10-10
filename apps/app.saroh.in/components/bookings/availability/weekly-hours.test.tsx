// @vitest-environment jsdom
/**
 * Weekly hours beside the business's opening hours (DEC-087): a person's
 * hours outside them are drawn as not bookable in person, and the day says
 * why; with no opening hours nothing changes.
 *
 * `react-dom/client` + `act` directly, as the editor's tests do.
 */
import type { ReactNode } from "react";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { WeeklyRange } from "@/lib/staff/types";

import { WeeklyHours } from "./weekly-hours";

// The popover is drawn in a portal-less stand-in with the same contract
// (open, onOpenChange, a trigger, content with role "dialog"): floating
// positioning has nothing to measure in jsdom.
vi.mock("@saroh/ui/popover", async () => {
    const { createContext, use } = await import("react");
    const Ctx = createContext<{
        open: boolean;
        onOpenChange: (open: boolean) => void;
    }>({ open: false, onOpenChange: () => undefined });
    return {
        Popover: ({
            open,
            onOpenChange,
            children,
        }: {
            open: boolean;
            onOpenChange: (open: boolean) => void;
            children?: ReactNode;
        }) => <Ctx value={{ open, onOpenChange }}>{children}</Ctx>,
        PopoverTrigger: ({ children }: { children?: ReactNode }) => {
            const { open, onOpenChange } = use(Ctx);
            return (
                <span data-trigger="" onClick={() => onOpenChange(!open)}>
                    {children}
                </span>
            );
        },
        PopoverContent: ({
            children,
            "aria-label": label,
        }: {
            children?: ReactNode;
            "aria-label"?: string;
        }) => (
            <div role="dialog" aria-label={label} data-popover="">
                {children}
            </div>
        ),
    };
});
// A Radix select is not what is tested here: a time is a plain field.
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

(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});
afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

// In 08:00–20:00 on Mondays and 10:00–14:00 on Sundays.
const HOURS: WeeklyRange[] = [
    { dayOfWeek: 1, startMinute: 480, endMinute: 1200 },
    { dayOfWeek: 0, startMinute: 600, endMinute: 840 },
];
// Open 09:00–18:00 Monday to Saturday.
const OPEN: WeeklyRange[] = [1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
    dayOfWeek,
    startMinute: 540,
    endMinute: 1080,
}));

function draw(opening: WeeklyRange[] | null) {
    act(() =>
        root.render(
            <WeeklyHours
                staffId="st_asha"
                hours={HOURS}
                opening={opening}
                kept={[]}
                canEdit={false}
                onChange={vi.fn()}
            />,
        ),
    );
}

/** The week's row for a day, and its first chip's classes. */
function row(day: string): HTMLLIElement | undefined {
    return Array.from(host.querySelectorAll<HTMLLIElement>("li")).find((li) =>
        li.textContent.startsWith(day),
    );
}
function chip(day: string): string {
    return (
        row(day)?.querySelector<HTMLSpanElement>("span.rounded-full")
            ?.className ?? ""
    );
}

describe("WeeklyHours — opening hours (DEC-087)", () => {
    it("says which of a day's hours aren't bookable in person, and why", () => {
        draw(OPEN);
        expect(row("Monday")?.textContent).toContain(
            "08:00–09:00 and 18:00–20:00 aren't bookable in person — you're open 09:00–18:00.",
        );
        // Part of Monday is inside: its chip still reads bookable.
        expect(chip("Monday")).toContain("bg-success-subtle");
    });

    it("draws a day the business is closed as not bookable in person", () => {
        draw(OPEN);
        expect(row("Sunday")?.textContent).toContain(
            "Not bookable in person — you're closed on Sundays.",
        );
        expect(chip("Sunday")).toContain("bg-muted");
    });

    it("cuts nothing with no opening hours", () => {
        draw(null);
        expect(host.textContent).not.toContain("bookable in person");
        expect(chip("Sunday")).toContain("bg-success-subtle");
    });
});

/**
 * "+ Hours" adds one range in a small popover over the day's row: the row
 * and the days under it stay where they are, a range that overlaps keeps it
 * open, and Cancel drops it.
 */
describe("WeeklyHours — + Hours", () => {
    const onChange = vi.fn();
    beforeEach(() => {
        onChange.mockReset();
        act(() =>
            root.render(
                <WeeklyHours
                    staffId="st_asha"
                    hours={HOURS}
                    kept={[]}
                    canEdit
                    onChange={onChange}
                />,
            ),
        );
    });

    const popover = () =>
        document.querySelector<HTMLElement>('[role="dialog"]');
    const buttonIn = (within: ParentNode | null | undefined, name: string) =>
        Array.from(
            within?.querySelectorAll<HTMLButtonElement>("button") ?? [],
        ).find((b) => b.textContent === name);
    const plus = (day: string) => buttonIn(row(day), "+ Hours");
    const time = (label: string) =>
        popover()?.querySelector<HTMLInputElement>(`[aria-label="${label}"]`) ??
        null;
    /** A row's markup without the attributes Radix flips on its trigger. */
    const drawn = (day: string) => row(day)?.innerHTML;
    async function press(el: HTMLElement | null | undefined) {
        await act(async () => {
            el?.click();
            await new Promise((r) => setTimeout(r, 0));
        });
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

    it("shows every day with nothing open and no field in the week", () => {
        expect(popover()).toBeNull();
        expect(host.querySelector("input, form")).toBeNull();
        expect(host.querySelectorAll("li")).toHaveLength(7);
    });

    it("opens over the row, named for the day, leaving the row as it was", async () => {
        const before = drawn("Monday");
        await press(plus("Monday"));
        expect(popover()?.getAttribute("aria-label")).toBe(
            "Add hours on Monday",
        );
        // The fields are in the popover, never a child of the week's row,
        // and what the row itself draws is what it drew before.
        const content = popover();
        content?.remove();
        expect(drawn("Monday")).toBe(before);
        row("Monday")
            ?.querySelector("[data-trigger]")
            ?.after(content ?? "");
        // An hour after the day's last range, for three hours.
        expect(time("From")?.value).toBe("1260");
        expect(time("To")?.value).toBe("1440");
    });

    it("refuses an overlap there and stays open with what was chosen", async () => {
        await press(plus("Monday"));
        type(time("From"), "600");
        expect(popover()?.querySelector('[role="alert"]')?.textContent).toBe(
            "That overlaps hours already set.",
        );
        expect(buttonIn(popover(), "Add hours")?.disabled).toBe(true);
        await press(buttonIn(popover(), "Add hours"));
        expect(onChange).not.toHaveBeenCalled();
        expect(time("From")?.value).toBe("600");
    });

    it("adds the range to the day and closes", async () => {
        await press(plus("Tuesday"));
        await press(buttonIn(popover(), "Add hours"));
        expect(onChange).toHaveBeenCalledWith([
            ...HOURS,
            { dayOfWeek: 2, startMinute: 540, endMinute: 720 },
        ]);
        expect(popover()).toBeNull();
    });

    it("drops it on Cancel, and the next opening starts from the day", async () => {
        await press(plus("Tuesday"));
        type(time("From"), "600");
        await press(buttonIn(popover(), "Cancel"));
        expect(popover()).toBeNull();
        expect(onChange).not.toHaveBeenCalled();
        await press(plus("Tuesday"));
        expect(time("From")?.value).toBe("540");
    });
});
