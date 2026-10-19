import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { DiaryBooking } from "@/lib/services/booking-calendar";
import type { Block, Column } from "@/lib/services/diary";
import { SERVICE_HOURS_NAME, UNASSIGNED } from "@/lib/services/diary";

import { DayByPerson } from "./day-by-person";
import { WeekView } from "./week-view";

const noop = () => undefined;

/**
 * The diary's look, read as the markup the server sends: bookings are the
 * only solid colour, free time is the plain page and still books, closed
 * time and time off are hatched, a short booking keeps its name, and one
 * with money still to take says so. The week draws the same blocks.
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
            phoneKey={columns[0]?.key ?? ""}
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

describe("free time is the plain page", () => {
    const html = draw([asha([block("b1", "Tariq Ali", 600, 660)])]);

    it("draws no filled or dashed Free block", () => {
        expect(html).not.toContain("bg-success-subtle");
        expect(html).not.toContain("border-dashed");
        expect(html).not.toMatch(/>Free /);
    });

    it("keeps each free gap a button that books at that time", () => {
        const gaps = html.match(/<button[^>]*data-free-gap[^>]*>/g) ?? [];
        expect(gaps).toHaveLength(3);
        expect(gaps[0]).toContain(
            'aria-label="Book Asha Rao at 9:00 am, free until 10:00 am"',
        );
        // Nothing at rest: the "Book 9:00 am" label waits for a pointer or
        // the keyboard's focus.
        const label = />Book (?:<!-- -->)?9:00 am</.exec(html);
        expect(label).not.toBeNull();
        expect(html).toContain("hidden group-focus-visible:flex");
    });

    it("offers no gap to someone who may not book", () => {
        expect(draw([asha([])], { canBook: false })).not.toContain(
            "data-free-gap",
        );
    });
});

describe("closed time and time off are hatched", () => {
    const html = draw([asha([])]);

    it("hatches closed time before opening and after closing only", () => {
        const closed = html.match(/<div[^>]*data-hatch="closed"[^>]*>/g) ?? [];
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

    it("keeps closed time a way to open hours, by name", () => {
        expect(html).toContain(
            'aria-label="Open hours for Asha Rao on Tue 29 Sep"',
        );
        expect(draw([asha([])], { canOpenHours: false })).not.toContain(
            "Open hours for",
        );
    });
});

describe("a booking block", () => {
    it("keeps its name on a 15 minute booking, name first and time second", () => {
        const html = draw([asha([block("b1", "Tariq Ali", 600, 615)])]);
        const at = html.indexOf("data-diary-block");
        const body = html.slice(at, html.indexOf("</button>", at));
        expect(body).toContain("Tariq Ali");
        expect(body.indexOf("Tariq Ali")).toBeLessThan(
            body.indexOf("10:00 am"),
        );
        // Never shorter than one readable line.
        expect(tag(html, 'data-diary-block="one"')).toContain(
            "min-height:calc(28 * var(--ppm, 0.8px))",
        );
        // The time gives way first; the name is what truncates last.
        expect(body).toContain("shrink-[99]");
    });

    it("is the solid booking colour, and nothing else is", () => {
        const html = draw([asha([block("b1", "Tariq Ali", 600, 660)])]);
        expect(tag(html, 'data-diary-block="one"')).toContain("bg-diary-one");
        expect(html.match(/bg-diary-one/g)).toHaveLength(1);
    });

    it("wears To pay while money is still to take, and says so by name", () => {
        const owing = draw([
            asha([
                block("b1", "Tariq Ali", 600, 660, {
                    paidWith: "DESK",
                    take: { cents: 50_000, byLink: true },
                }),
            ]),
        ]);
        expect(owing).toMatch(/data-to-pay=""[^>]*>To pay</);
        expect(tag(owing, 'data-diary-block="one"')).toMatch(
            /aria-label="[^"]*, to pay"/,
        );
        // The same colour as a paid booking: the mark is words, not a hue.
        expect(tag(owing, 'data-diary-block="one"')).toContain("bg-diary-one");

        const paid = draw([asha([block("b1", "Tariq Ali", 600, 660)])]);
        expect(paid).not.toContain("data-to-pay");
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
        expect(line).not.toContain("width:34%");
        expect(html).toContain("line-through");
    });
});

describe("the column heads", () => {
    it("show a person's initials and name", () => {
        const html = draw([asha([])]);
        expect(html).toContain(">AR<");
        expect(html).toContain(">Asha Rao<");
        expect(html).toContain("Stylist · 9:00");
    });

    it("keep Add who takes bookings at the head of the services' own column", () => {
        const services: Column = {
            key: UNASSIGNED,
            name: SERVICE_HOURS_NAME,
            title: "Each service's own hours",
            blocks: [],
            day: { windows: [[540, 1020]], off: [], free: [[540, 1020]] },
        };
        const html = draw([services], { onAddPerson: noop });
        expect(html).toContain(">Add who takes bookings<");
        // Not a person: no avatar, and no gap to tap-book with nobody.
        expect(html).not.toContain("data-ph-mask");
        expect(html).not.toContain("data-free-gap");
        // Its open time is plain all the same: only closed time is hatched.
        expect(html.match(/data-hatch="closed"/g)).toHaveLength(2);

        expect(draw([services])).not.toContain("Add who takes bookings");
    });
});

describe("the now line", () => {
    it("is not in what the server sends, so hydration cannot disagree", () => {
        const html = draw([asha([])], { today: true });
        expect(html).not.toContain("data-now-line");
        expect(html).not.toContain("data-now-time");
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
