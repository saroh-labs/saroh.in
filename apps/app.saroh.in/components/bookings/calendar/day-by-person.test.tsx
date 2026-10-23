import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { DiaryBooking } from "@/lib/services/booking-calendar";
import type { Block, Column } from "@/lib/services/diary";
import { SERVICE_HOURS_NAME, UNASSIGNED } from "@/lib/services/diary";

import { DayByPerson } from "./day-by-person";
import { WeekView } from "./week-view";

const noop = () => undefined;

/**
 * The Day calendar's look (U4, #1020), read as the markup the server sends:
 * bookings are the solid colour with one pill and one line, free time is a
 * green "Free · … + Book", closed time says "Closed · click to open" (a
 * phone: "tap"), time off is hatched the other way, the desk has a column
 * head per person, and Everyone on a phone is one list. The week keeps the
 * diary's own block.
 */

const booking = (
    id: string,
    name: string,
    extra: Partial<DiaryBooking> = {},
): DiaryBooking =>
    ({
        id,
        serviceId: "svc",
        status: "CONFIRMED",
        outcome: null,
        bookerName: name,
        bookerEmail: null,
        contact: null,
        paidWith: "PAID",
        service: { id: "svc", name: "Haircut", capacity: 1 },
        ...extra,
    }) as DiaryBooking;

const block = (
    key: string,
    name: string,
    start: number,
    end: number,
    extra: Partial<DiaryBooking> = {},
): Block => {
    const b = booking(key, name, extra);
    return {
        kind: "one",
        key,
        start,
        end,
        state: b.status === "CANCELLED" ? "cancelled" : "booked",
        staffId: "asha",
        booking: b,
    };
};

/** Asha works 9 to 5 with an hour off at 1, and has one booking at 10. */
const asha = (blocks: Block[]): Column => ({
    key: "asha",
    name: "Asha Rao",
    title: "Stylist",
    shortest: 30,
    blocks,
    day: {
        windows: [
            [540, 780],
            [840, 1020],
        ],
        off: [[780, 840]],
        free: [
            [540, 600],
            [660, 780],
            [840, 1020],
        ],
    },
});

const draw = (
    columns: Column[],
    over: Partial<Parameters<typeof DayByPerson>[0]> = {},
) =>
    renderToStaticMarkup(
        <DayByPerson
            columns={columns}
            span={[480, 1080]}
            today={false}
            timezone="Asia/Kolkata"
            sightKey="day:2026-09-29"
            selected={null}
            canBook
            canOpenHours
            dayText="Tue 29 Sep"
            onBlock={noop}
            onFree={noop}
            onClosed={noop}
            {...over}
        />,
    );

/** The opening tag of the first element carrying an attribute. */
const tag = (html: string, attr: string) =>
    new RegExp(`<[a-z]+[^>]*${attr}[^>]*>`).exec(html)?.[0] ?? "";

describe("free time is green and says so (BA-04)", () => {
    const html = draw([asha([block("b1", "Tariq Ali", 600, 660)])]);

    it("draws each free gap as a green dashed Free block with + Book", () => {
        const gaps = html.match(/<button[^>]*data-free-gap[^>]*>/g) ?? [];
        expect(gaps).toHaveLength(3);
        expect(gaps[0]).toContain("border-dashed");
        expect(gaps[0]).toContain("bg-success-subtle");
        expect(gaps[0]).toContain("text-success-subtle-foreground");
        expect(html).toMatch(/>Free · (?:<!-- -->)?9:00 to 10:00 am</);
        expect(html).toMatch(/data-free-book=""[^>]*>.*?Book</);
    });

    it("names the gap, the person and what a press does", () => {
        const gaps = html.match(/<button[^>]*data-free-gap[^>]*>/g) ?? [];
        expect(gaps[0]).toContain(
            'aria-label="Free 9:00 to 10:00 am with Asha Rao. Book or block"',
        );
    });

    it("is never under 44px on a phone, and inset 2px from its hours", () => {
        const gap = tag(html, "data-free-gap");
        expect(gap).toContain("max-[759px]:min-h-11");
        expect(gap).toContain("top:calc(calc(60 * var(--ppm, 0.8px)) + 2px)");
    });

    it("offers no gap to someone who may not book (Calendar only)", () => {
        expect(draw([asha([])], { canBook: false })).not.toContain(
            "data-free-gap",
        );
    });
});

describe("closed time and time off are hatched", () => {
    const html = draw([asha([])]);

    it("hatches closed time before opening and after closing only", () => {
        const closed =
            html.match(/<[a-z]+[^>]*data-hatch="closed"[^>]*>/g) ?? [];
        expect(closed).toHaveLength(2);
        // 8 to 9 am, then 5 to 6 pm, of the 8 am to 6 pm shown.
        expect(closed[0]).toContain("top:calc(0 * var(--ppm, 0.8px))");
        expect(closed[0]).toContain("height:calc(60 * var(--ppm, 0.8px))");
        expect(closed[1]).toContain("top:calc(540 * var(--ppm, 0.8px))");
    });

    it("tells time off from closed in words and direction, not colour alone", () => {
        const off = tag(html, 'data-hatch="off"');
        expect(off).toContain("45deg");
        expect(tag(html, 'data-hatch="closed"')).toContain("135deg");
        expect(html).toContain(">Time off<");
    });

    it("says what a press on closed time does: click on the desk, tap on a phone", () => {
        expect(html).toContain(">Closed · click to open<");
        expect(html).toContain(">Closed · tap to open<");
        expect(tag(html, "data-closed-time")).toContain(
            'aria-label="Closed 8:00 to 9:00 am. Open these hours for Asha Rao on Tue 29 Sep"',
        );
    });

    it("is only Closed, and not a button, for someone who can't change hours", () => {
        const still = draw([asha([])], { canOpenHours: false });
        expect(still).not.toContain("data-closed-time");
        expect(still).not.toContain("to open");
        expect(still).toContain(">Closed<");
        expect(tag(still, 'data-hatch="closed"')).toMatch(/^<div/);
    });

    it("draws an hour line across the column at each hour", () => {
        // 8 am to 6 pm: lines at 9, 10, … 5 pm.
        const lane = html.slice(html.indexOf("data-diary-column"));
        expect(lane.match(/h-px bg-border\/50/g)).toHaveLength(9);
    });
});

describe("a booking block", () => {
    it("keeps its name on a 15 minute booking, name first and its line second", () => {
        const html = draw([asha([block("b1", "Tariq Ali", 600, 615)])]);
        const at = html.indexOf("data-diary-block");
        const body = html.slice(at, html.indexOf("</button>", at));
        expect(body).toContain("Tariq Ali");
        expect(body.indexOf("Tariq Ali")).toBeLessThan(
            body.indexOf("10:00 to 10:15 am"),
        );
        // Never shorter than one readable line: 44px on a phone.
        expect(tag(html, 'data-diary-block="one"')).toContain(
            "min-height:calc(28 * var(--ppm, 0.8px))",
        );
        // One row on the desk, rows from the top on a phone.
        expect(tag(html, 'data-diary-block="one"')).toContain("flex-row");
        expect(tag(html, 'data-diary-block="one"')).toContain(
            "max-[759px]:flex-col",
        );
    });

    it("says when and what in one line: 9:00 to 9:45 am · the service", () => {
        const html = draw([asha([block("b1", "Tariq Ali", 600, 660)])]);
        expect(html).toMatch(/>10:00 to 11:00 am · Haircut</);
    });

    it("is the solid booking colour, and nothing else is", () => {
        const html = draw([asha([block("b1", "Tariq Ali", 600, 660)])]);
        expect(tag(html, 'data-diary-block="one"')).toContain("bg-diary-one");
        expect(html.match(/bg-diary-one/g)).toHaveLength(1);
    });

    it("wears one pill: Pays at the visit while money is still to take", () => {
        const owing = draw([
            asha([
                block("b1", "Tariq Ali", 600, 660, {
                    paidWith: "DESK",
                    take: { cents: 50_000, byLink: true },
                }),
            ]),
        ]);
        expect(owing).toMatch(/data-day-pill=""[^>]*>Pays at the visit</);
        expect(tag(owing, 'data-diary-block="one"')).toMatch(
            /aria-label="[^"]*, to pay"/,
        );
        // The same colour as a paid booking: the pill is words, not a hue.
        expect(tag(owing, 'data-diary-block="one"')).toContain("bg-diary-one");

        const paid = draw([asha([block("b1", "Tariq Ali", 600, 660)])]);
        expect(paid).toMatch(/data-day-pill=""[^>]*>Paid</);
        expect(paid).not.toContain("to pay");
    });

    it("draws a cancelled booking as a thin struck line that still opens", () => {
        const html = draw([
            asha([
                block("gone", "Meera Shah", 900, 960, { status: "CANCELLED" }),
            ]),
        ]);
        const line = tag(html, 'data-diary-block="cancelled"');
        expect(line).toMatch(/^<button/);
        expect(line).toContain("h-[18px]");
        expect(line).toContain("Cancelled");
        expect(line).not.toContain("bg-diary-one");
        expect(html).toContain("line-through");
    });
});

describe("the column heads (desk)", () => {
    it("show a person's face, name, hours and count", () => {
        const html = draw([asha([block("b1", "Tariq Ali", 600, 660)])]);
        expect(html).toContain(">AR<");
        expect(html).toContain(">Asha Rao<");
        expect(html).toContain(">Stylist · 9 am to 5 pm<");
        expect(html).toContain(">1 booked<");
        expect(draw([asha([])])).toContain(">Nothing booked<");
    });

    it("are not drawn on a phone, where the chip says whose day it is", () => {
        expect(tag(draw([asha([])]), "data-column-head")).toContain(
            "max-[759px]:hidden",
        );
    });

    it("draw the services' own column with its hours, closed time only Closed, and no Free", () => {
        const services: Column = {
            key: UNASSIGNED,
            name: SERVICE_HOURS_NAME,
            title: "Each service's own hours",
            blocks: [],
            day: { windows: [[540, 1020]], off: [], free: [[540, 1020]] },
        };
        const html = draw([services]);
        expect(html).toContain(">Service hours<");
        expect(html).not.toContain("data-free-gap");
        // Nobody's hours to open: its closed time is a still hatch.
        expect(html.match(/data-hatch="closed"/g)).toHaveLength(2);
        expect(html).not.toContain("data-closed-time");
    });
});

describe("Everyone on a phone", () => {
    const arjun: Column = {
        ...asha([]),
        key: "arjun",
        name: "Arjun Rao",
        blocks: [
            {
                ...block("a1", "Isha Joshi", 630, 690),
                staffId: "arjun",
            },
        ],
    };
    const both = [asha([block("b1", "Tariq Ali", 600, 660)]), arjun];

    it("is one list where each booking says whose it is; the desk keeps a column each", () => {
        const html = draw(both, { everyone: true });
        expect(html.match(/data-diary-column="/g)).toHaveLength(2);
        expect(tag(html, "data-day-grid")).toContain("max-[759px]:hidden");
        expect(tag(html, "data-day-everyone")).toContain("min-[760px]:hidden");
        expect(html).toContain(">Tariq Ali · Asha<");
        expect(html).toContain(">Isha Joshi · Arjun<");
        // Overlapping bookings sit side by side, never on top.
        const phone = html.slice(html.indexOf("data-everyone-column"));
        expect(phone.match(/width:calc\(50% - 4px\)/g)).toHaveLength(2);
    });

    it("is one column for one person, which serves both widths", () => {
        const html = draw([asha([])], { everyone: true });
        expect(html).not.toContain("data-day-everyone");
        expect(tag(html, "data-day-grid")).not.toContain("max-[759px]:hidden");
    });

    it("picked person: no merging even with several columns asked", () => {
        expect(draw(both)).not.toContain("data-day-everyone");
    });
});

describe("the now line", () => {
    it("is not in what the server sends, so hydration cannot disagree", () => {
        const html = draw([asha([])], { today: true });
        expect(html).not.toContain("data-now-line");
        expect(html).not.toContain("data-now-time");
    });

    it("a phone draws a minute twice as tall", () => {
        expect(tag(draw([asha([])]), "data-day-grid")).toContain(
            "max-[759px]:[--ppm:1.6px]",
        );
    });
});

describe("the week agrees with the day", () => {
    const html = renderToStaticMarkup(
        <WeekView
            days={[
                {
                    date: "2026-09-29",
                    label: "Tue 29 Sep",
                    blocks: [
                        block("b1", "Tariq Ali", 600, 615, {
                            paidWith: "DESK",
                        }),
                        block("gone", "Meera Shah", 900, 960, {
                            status: "CANCELLED",
                        }),
                    ],
                    hours: { windows: [[540, 1020]], off: [] },
                    today: false,
                    selected: true,
                    cols: [],
                    closed: null,
                },
                {
                    date: "2026-09-30",
                    label: "Wed 30 Sep",
                    blocks: [],
                    hours: null,
                    today: false,
                    selected: false,
                    cols: [],
                    closed: null,
                },
            ]}
            span={[480, 1080]}
            timezone="Asia/Kolkata"
            sightKey="week:2026-09-28"
            selected={null}
            canBook
            canOpenHours
            offersFree={() => true}
            onDay={noop}
            onBlock={noop}
            onFree={noop}
            onOpenDay={noop}
        />,
    );

    it("hatches closed time and leaves free time plain", () => {
        // One day knows its hours: closed before 9 and after 5.
        expect(html.match(/data-hatch="closed"/g)).toHaveLength(2);
        expect(html).not.toContain("bg-success-subtle");
    });

    it("draws the same block: name first, a minimum height, the to-pay mark", () => {
        const one = tag(html, 'data-diary-block="one"');
        expect(one).toContain("min-height:calc(28 * var(--ppm, 0.8px))");
        expect(one).toContain('aria-label="Tue 29 Sep, 10:00');
        expect(html).toMatch(/data-to-pay=""[^>]*>To pay</);
    });

    it("draws a cancelled booking as the thin line, whole, not a cut chip", () => {
        const line = tag(html, 'data-diary-block="cancelled"');
        expect(line).toContain("h-[18px]");
        expect(line).not.toContain("overflow-hidden");
    });
});
