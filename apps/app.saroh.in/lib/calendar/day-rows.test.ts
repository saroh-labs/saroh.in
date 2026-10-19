import { describe, expect, it } from "vitest";

import { dayRow } from "./day-rows";
import type { CalendarItem } from "./types";

const IST = "Asia/Kolkata";
const at = { timeZone: IST, ahead: false };

function item(over: Partial<CalendarItem>): CalendarItem {
    return {
        id: "x",
        kind: "booked",
        title: "",
        subtitle: null,
        at: "2026-10-19T03:30:00Z", // 9:00 am in India
        link: { type: "booking", id: "x" },
        ...over,
    };
}

describe("a row of the picked day (U13)", () => {
    it("a booking leads with who, then what and with whom", () => {
        const row = dayRow(
            "bookings",
            item({
                title: "Physio assessment · Ananya Desai",
                subtitle: "With Meera Iyer · Paid online",
            }),
            at,
        );
        expect(row).toMatchObject({
            time: "9:00 am",
            title: "Ananya Desai",
            sub: "Physio assessment · Meera",
            href: "/bookings/x",
            flag: null,
        });
    });

    it("a no-show keeps its flag", () => {
        const row = dayRow(
            "bookings",
            item({ kind: "no_show", title: "Sports massage · Vikram Nair" }),
            at,
        );
        expect(row.flag).toEqual({ label: "Didn't come", tone: "bad" });
        expect(row.sub).toBe("Sports massage");
    });

    it("a class has its time in the column, not the title", () => {
        const row = dayRow(
            "classes",
            item({
                kind: "full",
                title: "Mat Pilates",
                link: { type: "service", id: "s" },
            }),
            { timeZone: IST, ahead: true },
        );
        expect(row.time).toBe("9:00 am");
        expect(row.title).toBe("Mat Pilates");
        // The day already says it is still to come.
        expect(row.sub).toBe("");
        expect(row.flag?.label).toBe("Full");
    });

    it("a paid invoice names who paid, then its number", () => {
        const row = dayRow(
            "invoices",
            item({
                kind: "paid",
                title: "INV-0118",
                subtitle: "Rohan Mehta",
                link: { type: "invoice", id: "i" },
            }),
            at,
        );
        expect(row).toMatchObject({
            time: "9:00 am",
            title: "Paid · Rohan Mehta",
            sub: "INV-0118",
            href: "/billing/invoices/i",
        });
    });

    it("a renewal has no time of its own", () => {
        const row = dayRow(
            "subscriptions",
            item({
                kind: "renewal",
                title: "Weekly bread box",
                subtitle: "Asha Rao",
                link: { type: "subscription", id: "s" },
            }),
            at,
        );
        expect(row.time).toBeNull();
        expect(row.title).toBe("Renewed · Weekly bread box");
    });
});
