// @vitest-environment jsdom
/**
 * Weekly hours beside the business's opening hours (DEC-087): a person's
 * hours outside them are drawn as not bookable in person, and the day says
 * why; with no opening hours nothing changes.
 *
 * `react-dom/client` + `act` directly, as the editor's tests do.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { WeeklyRange } from "@/lib/staff/types";

import { WeeklyHours } from "./weekly-hours";

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
