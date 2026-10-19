import { describe, expect, it } from "vitest";

import type { ServiceDraft } from "./service-editor";
import { draftOf } from "./service-editor";
import {
    addedMessage,
    bookersOf,
    bookersPatch,
    bookersToast,
    gapsLine,
    lengthNote,
    lengthSaved,
    listWords,
    liveLine,
    mixOf,
    pauseLabel,
    sameNameAs,
    takingLine,
    withSameName,
} from "./service-form";
import { daysWords, detailRows, editCards } from "./service-panels";

const draft = (over: Partial<ServiceDraft> = {}): ServiceDraft => ({
    ...draftOf(null, [], "Asia/Kolkata"),
    name: "Dry needling",
    price: "1200",
    staffIds: ["st_meera"],
    ...over,
});

describe("Who can book it (DEC-170, Q5)", () => {
    it("reads the ticks, none for a service paused the old way", () => {
        expect(
            bookersOf({
                status: "ACTIVE",
                showOnBookingPage: true,
                bookableByTeam: false,
            }),
        ).toEqual({ customers: true, team: false });
        expect(
            bookersOf({
                status: "ARCHIVED",
                showOnBookingPage: true,
                bookableByTeam: true,
            }),
        ).toEqual({ customers: false, team: false });
    });

    it("names all four mixes; neither is paused", () => {
        expect(mixOf({ customers: true, team: true })).toBe("both");
        expect(mixOf({ customers: true, team: false })).toBe("customers");
        expect(mixOf({ customers: false, team: true })).toBe("team");
        expect(mixOf({ customers: false, team: false })).toBe("paused");
    });

    it("a tick on takes it off an old pause; neither leaves the status", () => {
        expect(bookersPatch({ customers: false, team: true })).toEqual({
            status: "ACTIVE",
            showOnBookingPage: false,
            bookableByTeam: true,
        });
        expect(bookersPatch({ customers: false, team: false })).toEqual({
            showOnBookingPage: false,
            bookableByTeam: false,
        });
    });

    it("says each mix under the ticks, with what is still to come", () => {
        expect(takingLine({ customers: true, team: true }, 9)).toBe(
            "Customers book it on your booking page, and your team books it from Bookings. 9 bookings to come.",
        );
        expect(takingLine({ customers: true, team: false }, 0)).toBe(
            "Your team can't book it from Bookings.",
        );
        expect(takingLine({ customers: false, team: true }, null)).toBe(
            "It's not on your booking page.",
        );
        expect(takingLine({ customers: false, team: false }, 9)).toBe(
            "Untick both to pause it. Bookings already made stay.",
        );
    });

    it("says what a tick did, and how More pauses", () => {
        expect(bookersToast("Yoga", { customers: false, team: true })).toBe(
            "Yoga: only your team can book it now, from Bookings.",
        );
        expect(bookersToast("Yoga", { customers: false, team: false })).toBe(
            "Yoga paused. Nobody can book it, and bookings already made stay.",
        );
        expect(pauseLabel({ customers: true, team: false })).toBe(
            "Pause: untick both, nobody can book it",
        );
        expect(pauseLabel({ customers: false, team: false })).toBe(
            "Start taking bookings again",
        );
    });
});

describe("the live line", () => {
    const input = (over: Partial<ServiceDraft> = {}) => ({
        draft: draft(over),
        staffNeeded: true,
        names: ["Meera"],
        hasPage: true as boolean | null,
    });

    it("says what is missing, in the order the page asks", () => {
        expect(
            liveLine(input({ name: "", price: "", staffIds: [] })).text,
        ).toBe(
            "Not bookable yet: add a name and a price, then pick who does it.",
        );
        expect(liveLine(input({ staffIds: [] }))).toEqual({
            ready: false,
            text: "Not bookable yet: pick who does it.",
        });
        expect(
            liveLine({
                ...input({ kind: "class", hours: [] }),
                staffNeeded: false,
            }).text,
        ).toBe("Not bookable yet: give it weekly times.");
    });

    it("says who can book it for each mix", () => {
        expect(liveLine(input()).text).toBe(
            "Customers can book this on your booking page, in Meera's free time, as soon as you add it.",
        );
        expect(liveLine(input({ bookableByTeam: false })).text).toBe(
            "Customers can book this on your booking page, in Meera's free time, as soon as you add it. Your team can't book it from Bookings.",
        );
        expect(liveLine(input({ showOnBookingPage: false })).text).toBe(
            "Only your team can book this, from Bookings. It's not on your booking page.",
        );
        expect(
            liveLine(input({ showOnBookingPage: false, bookableByTeam: false }))
                .text,
        ).toBe("Paused: nobody can book it until you tick who can.");
    });

    it("says so when there is no booking page yet", () => {
        expect(liveLine({ ...input(), hasPage: false }).text).toBe(
            "Your team can book this from Bookings. Customers can once your booking page is live.",
        );
    });
});

describe("pressing Add with gaps", () => {
    it("counts the fields and names them, with the comma before and", () => {
        expect(
            gapsLine([
                { field: "name", message: "" },
                { field: "price", message: "" },
                { field: "staffIds", message: "" },
            ]),
        ).toBe(
            "3 things to fill in before it can be added: a name, a price (0 if it's free), and who does it.",
        );
        expect(gapsLine([{ field: "name", message: "" }])).toBe(
            "1 thing to fill in before it can be added: a name.",
        );
        expect(listWords(["a", "b"])).toBe("a and b");
    });
});

describe("a name already taken", () => {
    const others = [{ id: "sv_9", name: "Physio assessment" }];

    it("is found whatever its case and spaces, never itself", () => {
        expect(sameNameAs(" physio ASSESSMENT ", others)?.id).toBe("sv_9");
        expect(sameNameAs("Physio assessment", others, "sv_9")).toBeNull();
        expect(sameNameAs("", others)).toBeNull();
    });

    it("is the name's problem, ahead of the rest", () => {
        expect(withSameName([], "Physio assessment", others, null)).toEqual([
            { field: "name", message: "You already have Physio assessment." },
        ]);
    });
});

describe("rows and cards", () => {
    const base = {
        names: ["Meera"],
        fullNames: ["Meera Iyer"],
        currency: "INR",
        businessZone: "Asia/Kolkata",
        zoneShort: "IST",
        hoursRead: true,
        gstAt: "none" as const,
    };

    it("More details keeps every field, GST only where it is asked", () => {
        expect(
            detailRows({ ...base, draft: draft() }).map((r) => r.label),
        ).toEqual([
            "What to tell customers",
            "Break after",
            "Break before",
            "Where",
            "Visits in a package",
            "When it can be booked",
            "At booking, they pay",
            "Time zone",
        ]);
        expect(
            detailRows({ ...base, gstAt: "price", draft: draft() }).map(
                (r) => r.label,
            ),
        ).toContain("GST and SAC code");
        const visits = detailRows({
            ...base,
            draft: draft({ kind: "class" }),
        }).find((r) => r.panel === "visits");
        expect(visits).toMatchObject({ value: "Not for classes", off: true });
    });

    it("a saved service is What it is, Time and place, and Money", () => {
        const cards = editCards({ ...base, draft: draft({ minutes: "45" }) });
        expect(cards.map((c) => c.title)).toEqual([
            "What it is",
            "Time and place",
            "Money",
        ]);
        expect(cards[1]?.rows.map((r) => [r.label, r.value])).toEqual([
            ["How long", "45 min"],
            ["Break after", "15 min"],
            ["Break before", "None"],
            ["Where", "In person"],
            ["When it can be booked", "In Meera's hours · or give it its own"],
            ["Time zone", "Same as your business (IST)"],
        ]);
    });

    it("says which days its own hours cover", () => {
        const day = (d: number) => ({
            dayOfWeek: d,
            start: "09:00",
            end: "17:00",
        });
        expect(daysWords([1, 2, 3, 4, 5, 6].map(day))).toBe("Mon to Sat");
        expect(daysWords([1, 3, 5].map(day))).toBe("Mon, Wed, and Fri");
        expect(daysWords([0, 1, 2, 3, 4, 5, 6].map(day))).toBe("Every day");
    });
});

describe("a new length on a service with bookings", () => {
    it("says what each visit takes, and what bookings made keep", () => {
        expect(
            lengthNote({
                minutes: "60",
                savedMinutes: "45",
                gap: "15",
                names: ["Meera"],
                comingUp: 9,
            }),
        ).toBe(
            "With the 15 min break after, each visit takes 60 min + 15 min break of Meera's time. 9 bookings already made keep 45 min.",
        );
        expect(lengthSaved("60", "45", 9)).toBe(
            "Saved: 60 min. New bookings use it, and 9 already made keep 45 min.",
        );
        expect(lengthSaved("60", "45", 0)).toBe(
            "Saved: 60 min. New bookings use it.",
        );
    });
});

describe("the toast once added", () => {
    it("says who can book it when it isn't customers", () => {
        expect(
            addedMessage("Yoga", { customers: false, team: true }, "usual"),
        ).toBe("Yoga added. Only your team can book it, from Bookings.");
        expect(
            addedMessage("Yoga", { customers: true, team: false }, "usual"),
        ).toBe("usual");
    });
});
