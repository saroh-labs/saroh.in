import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { BookingDays, BookingStart } from "../model";
import { OneToOne } from "./one-to-one";

/**
 * Each look's day strip and time chips are its board's (DEC-172, wave 4);
 * with no look, Classic's are exactly as they were. Made-up times only.
 */

const START: BookingStart = {
    startAt: "2026-10-20T04:30:00.000Z",
    endAt: "2026-10-20T05:30:00.000Z",
    staffId: null,
    staffName: null,
    placesLeft: null,
};

const DAYS: BookingDays = {
    timezone: "Asia/Kolkata",
    kind: "one",
    capacity: 1,
    days: [
        { date: "2026-10-19", open: true, starts: [] },
        { date: "2026-10-20", open: true, starts: [START] },
    ],
};

function draw(look?: "quiet" | "folio" | "live") {
    render(
        <OneToOne
            days={DAYS}
            day={DAYS.days[1] ?? null}
            zone="Asia/Kolkata"
            staff={[]}
            chosen={START}
            onDay={vi.fn()}
            onStart={vi.fn()}
            business="Rye"
            look={look}
        />,
    );
    const day = within(
        screen.getByRole("radiogroup", { name: "Day" }),
    ).getByRole("radio", { checked: true });
    const time = screen.getByRole("radio", { name: "10:00 am" });
    return { day, time };
}

describe("a look's day strip and time chips", () => {
    it("Quiet draws pill days and pill chips", () => {
        const { day, time } = draw("quiet");
        expect(day.className).toContain("rounded-[40px]");
        expect(time.className).toContain("rounded-full");
        expect(time.className).toContain("min-w-24");
    });

    it("Folio draws square, edged days and chips", () => {
        const { day, time } = draw("folio");
        expect(day.className).toContain("rounded-none");
        expect(time.className).toContain("min-w-[88px]");
    });

    it("Live draws 16px cards with a condensed time", () => {
        const { time } = draw("live");
        expect(time.className).toContain("rounded-2xl");
        expect(time.className).toContain("[font-stretch:80%]");
    });

    it("keeps Classic's shapes with no look", () => {
        const { day, time } = draw();
        expect(day.className).toContain(
            "rounded-[calc(var(--site-radius)+12px)]",
        );
        expect(time.className).toContain("h-[45px]");
    });
});
