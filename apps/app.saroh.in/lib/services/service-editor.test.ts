import { describe, expect, it } from "vitest";

import type { Service } from "./service";
import type { ServiceDraft } from "./service-editor";
import {
    bookingPageNote,
    changedSections,
    depositNote,
    draftOf,
    draftVisits,
    fromMinor,
    glance,
    needsMeetingLink,
    savedMessage,
    serviceInput,
    serviceProblems,
    serviceUpdate,
    showKind,
    staffFor,
    staffNote,
    stateLine,
    statePill,
    timeNote,
    toMinor,
    TREATMENT_NEEDS_STOREFRONT,
    VIEW_ONLY,
    whereNote,
} from "./service-editor";

describe("VIEW_ONLY (E26)", () => {
    it("says the role can't change set-up, in words, with no permission code", () => {
        expect(VIEW_ONLY).toBe(
            "View only — your role can't change services, hours or booking rules.",
        );
        expect(VIEW_ONLY).not.toMatch(/:|booking settings/);
    });
});

const service = (over: Partial<Service> = {}): Service => ({
    id: "sv_1",
    organizationId: "org_1",
    siteId: null,
    name: "Personal training",
    description: "One-to-one, built around your goals.",
    durationMinutes: 60,
    bufferBeforeMinutes: 5,
    bufferAfterMinutes: 15,
    capacity: 1,
    priceCents: 120_000,
    currency: "INR",
    gstRate: "18.00",
    sacCode: "999723",
    timezone: "Asia/Kolkata",
    status: "ACTIVE",
    locationType: "IN_PERSON",
    meetingUrl: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    visits: 3,
    depositMode: "PERCENT_50",
    depositCents: 60_000,
    showOnBookingPage: true,
    ...over,
});

const draft = (over: Partial<ServiceDraft> = {}): ServiceDraft => ({
    ...draftOf(service(), ["st_vikram"], "Asia/Kolkata"),
    ...over,
});

describe("toMinor", () => {
    it("reads an amount as typed, without floating point", () => {
        expect(toMinor("1200")).toBe(120_000);
        expect(toMinor("1,200.5")).toBe(120_050);
        expect(toMinor("₹ 499.99")).toBe(49_999);
        expect(toMinor("")).toBeNull();
        expect(toMinor("twelve")).toBeNaN();
        expect(toMinor("1.234")).toBeNaN();
        expect(fromMinor(120_050)).toBe("1200.50");
        expect(fromMinor(120_000)).toBe("1200");
    });
});

describe("draftOf", () => {
    it("opens a saved service with every field it has, More settings included", () => {
        expect(draftOf(service(), ["st_b", "st_a"], "Europe/London")).toEqual({
            name: "Personal training",
            description: "One-to-one, built around your goals.",
            kind: "one",
            minutes: "60",
            gap: "15",
            visits: "3",
            places: "",
            where: "IN_PERSON",
            meetingUrl: "",
            price: "1200",
            deposit: "PERCENT_50",
            staffIds: ["st_a", "st_b"],
            showOnBookingPage: true,
            taking: true,
            timezone: "Asia/Kolkata",
            bufferBefore: "5",
            gstRate: "18",
            sacCode: "999723",
        });
    });

    it("reads a class, a paused and hidden service, and an Either link", () => {
        const d = draftOf(
            service({
                capacity: 12,
                status: "ARCHIVED",
                showOnBookingPage: false,
                locationType: "EITHER",
                meetingUrl: "https://meet.example/x",
            }),
            [],
            "Asia/Kolkata",
        );
        expect(d).toMatchObject({
            kind: "class",
            places: "12",
            taking: false,
            showOnBookingPage: false,
            where: "EITHER",
            meetingUrl: "https://meet.example/x",
        });
    });

    it("starts a new one at 30 minutes, a 10-minute gap, in person, shown, in the business's zone", () => {
        expect(draftOf(null, [], "Asia/Kolkata")).toMatchObject({
            name: "",
            minutes: "30",
            gap: "10",
            where: "IN_PERSON",
            showOnBookingPage: true,
            taking: true,
            timezone: "Asia/Kolkata",
            price: "",
        });
    });
});

describe("serviceProblems", () => {
    it("says nothing for a service that can be saved", () => {
        expect(serviceProblems(draft(), true)).toEqual([]);
    });

    it("names each thing that stops a save, in the design's words", () => {
        expect(
            serviceProblems(
                draft({
                    name: " ",
                    minutes: "4",
                    gap: "",
                    price: "",
                    staffIds: [],
                }),
                true,
            ),
        ).toEqual([
            "Add a name.",
            "Each visit needs a length of at least 5 minutes.",
            "The gap after has to be a number of minutes.",
            "Add a price (0 if it's free).",
            "Pick who takes it.",
        ]);
    });

    it("takes 0 as free, and refuses a price that isn't a number", () => {
        expect(
            serviceProblems(draft({ price: "0", deposit: "NONE" }), true),
        ).toEqual([]);
        expect(serviceProblems(draft({ price: "12,00.5.0" }), true)).toEqual([
            "Write the price as a number, like 1200.",
        ]);
    });

    it("refuses a class under two places", () => {
        expect(
            serviceProblems(draft({ kind: "class", places: "1" }), true),
        ).toEqual(["A class needs at least 2 places."]);
        expect(
            serviceProblems(draft({ kind: "class", places: "8" }), true),
        ).toEqual([]);
    });

    it("asks online and Either for an https link", () => {
        expect(serviceProblems(draft({ where: "EITHER" }), true)).toEqual([
            "Paste the link people join by.",
        ]);
        expect(
            serviceProblems(
                draft({ where: "ONLINE", meetingUrl: "http://meet.x/y" }),
                true,
            ),
        ).toEqual([
            "The link has to be a full https:// link, like https://meet.google.com/abc-defg-hij.",
        ]);
        expect(
            serviceProblems(
                draft({ where: "EITHER", meetingUrl: "https://meet.x/y" }),
                true,
            ),
        ).toEqual([]);
    });

    it("lets a business with nobody on the diary save a service", () => {
        expect(serviceProblems(draft({ staffIds: [] }), false)).toEqual([]);
    });

    it("checks More settings too: the buffer, the zone and the SAC code", () => {
        expect(
            serviceProblems(
                draft({ bufferBefore: "", timezone: " ", sacCode: "12" }),
                true,
            ),
        ).toEqual([
            "The buffer before has to be a number of minutes.",
            "Pick a time zone.",
            "A SAC code is 4 to 8 digits.",
        ]);
    });
});

describe("serviceInput", () => {
    it("sends the fields as the API takes them, the deposit's mode and the visits", () => {
        const input = serviceInput(
            draft({ where: "EITHER", meetingUrl: " https://meet.x/y " }),
            "INR",
        );
        expect(input).toEqual({
            name: "Personal training",
            description: "One-to-one, built around your goals.",
            durationMinutes: 60,
            bufferBeforeMinutes: 5,
            bufferAfterMinutes: 15,
            capacity: 1,
            priceCents: 120_000,
            currency: "INR",
            gstRate: "18",
            sacCode: "999723",
            timezone: "Asia/Kolkata",
            locationType: "EITHER",
            meetingUrl: "https://meet.x/y",
            showOnBookingPage: true,
            depositMode: "PERCENT_50",
            visits: 3,
        });
        // Never an amount: the server works the deposit out (E8).
        expect(input).not.toHaveProperty("depositCents");
    });

    it("clears the link in person, a class sends its places, blank GST clears", () => {
        const input = serviceInput(
            draft({
                meetingUrl: "https://left.over",
                kind: "class",
                places: "10",
                gstRate: "",
                sacCode: " ",
            }),
            "INR",
        );
        expect(input).toMatchObject({
            meetingUrl: null,
            capacity: 10,
            gstRate: null,
            sacCode: null,
        });
    });

    it("an update carries whether it takes bookings", () => {
        expect(serviceUpdate(draft({ taking: false }), "INR").status).toBe(
            "ARCHIVED",
        );
        expect(serviceUpdate(draft(), "INR").status).toBe("ACTIVE");
    });
});

describe("changedSections", () => {
    it("names the sections that changed, in page order, and ignores staff order", () => {
        const saved = draft({ staffIds: ["a", "b"] });
        expect(
            changedSections(saved, { ...saved, staffIds: ["b", "a"] }),
        ).toEqual([]);
        expect(
            changedSections(saved, {
                ...saved,
                price: "1500",
                name: "PT",
                timezone: "Europe/London",
                taking: false,
            }),
        ).toEqual(["What it is", "Price", "Taking bookings", "More settings"]);
    });
});

describe("the words around the editor", () => {
    it("says what state it is in", () => {
        expect(stateLine({ isNew: false, dirty: true, comingUp: 3 })).toBe(
            "Unsaved changes",
        );
        expect(stateLine({ isNew: true, dirty: false, comingUp: 0 })).toBe(
            "Not saved yet",
        );
        expect(stateLine({ isNew: false, dirty: false, comingUp: 1 })).toBe(
            "1 booking still to come",
        );
        expect(stateLine({ isNew: false, dirty: false, comingUp: 0 })).toBe(
            "Nothing booked yet",
        );
        expect(stateLine({ isNew: false, dirty: false, comingUp: null })).toBe(
            "",
        );
        expect(statePill(true, true).label).toBe("New");
        expect(statePill(false, false)).toEqual({
            label: "Not taking bookings",
            tone: "neutral",
        });
    });

    it("says what saving did to bookings already made", () => {
        expect(
            savedMessage({
                isNew: true,
                name: "Check-up",
                kind: "one",
                comingUp: 0,
            }),
        ).toBe("Check-up added. It's bookable now.");
        expect(
            savedMessage({
                isNew: true,
                name: "Yoga",
                kind: "class",
                comingUp: 0,
            }),
        ).toBe("Yoga added. Set its weekly times under More settings.");
        expect(
            savedMessage({ isNew: false, name: "x", kind: "one", comingUp: 2 }),
        ).toBe(
            "Saved. New bookings use it; 2 bookings already made keep the old details.",
        );
        expect(
            savedMessage({ isNew: false, name: "x", kind: "one", comingUp: 0 }),
        ).toBe("Saved. New bookings use it; nothing already booked changes.");
        expect(
            savedMessage({
                isNew: false,
                name: "x",
                kind: "one",
                comingUp: null,
            }),
        ).toContain("bookings already made keep their details");
    });

    it("explains time, where, the booking page and who takes it", () => {
        expect(timeNote("class", true)).toBe(
            "A class runs at set times; people book a place.",
        );
        expect(timeNote("one", false)).toContain("its own weekly hours");
        expect(whereNote("EITHER")).toBe(
            "They pick when booking. Online visits join by the link below.",
        );
        expect(bookingPageNote(false, true)).toBe(
            "You don't have a booking page yet. Staff can still book it from the calendar.",
        );
        expect(bookingPageNote(null, false)).toBe(
            "Only staff can book it, from the calendar.",
        );
        expect(bookingPageNote(true, true)).toBe(
            "Customers can book it themselves.",
        );
        const people = [
            { id: "a", name: "Asha" },
            { id: "b", name: "Vikram" },
        ];
        expect(staffNote(["a", "b"], people)).toBe(
            "Customers can pick who, or take whoever's free first.",
        );
        expect(staffNote(["b"], people)).toBe(
            "Only Vikram's free time is offered.",
        );
        expect(staffNote([], people)).toBe("Nobody picked yet.");
    });
});

describe("glance", () => {
    it("shows the price, the time it needs and how it is booked", () => {
        expect(
            glance(draft({ visits: "1" }), { thisWeek: 4, comingUp: 7 }, "INR"),
        ).toEqual([
            ["Price", "₹1,200"],
            ["Time needed", "60 min + 15 min gap"],
            ["Booked this week", "4"],
            ["Still to come", "7"],
        ]);
    });

    it("a treatment's price is for every visit, and so is its time (E10)", () => {
        expect(glance(draft(), { thisWeek: 4, comingUp: 7 }, "INR")).toEqual([
            ["Price", "₹1,200 for 3 visits"],
            ["Per visit", "₹400"],
            ["Time needed", "3 × 60 min"],
            ["Booked this week", "4"],
            ["Still to come", "7"],
        ]);
    });

    it("says Free at 0, a dash for no price, and a failed count as such", () => {
        const rows = glance(draft({ price: "0", visits: "1" }), null, "INR");
        expect(rows[0]).toEqual(["Price", "Free"]);
        expect(rows[2]).toEqual(["Booked this week", "Couldn't count"]);
        expect(glance(draft({ price: "" }), null, "INR")[0]).toEqual([
            "Price",
            "—",
        ]);
    });
});

describe("showKind", () => {
    it("shows Kind for a business with classes or no services, and a class being edited", () => {
        const one = { id: "a", capacity: 1 };
        const cls = { id: "b", capacity: 10 };
        expect(showKind([], null)).toBe(true);
        expect(showKind([one, cls], null)).toBe(true);
        expect(showKind([one], null)).toBe(false);
        expect(showKind([one], { capacity: 6 })).toBe(true);
    });
});

describe("staffFor and needsMeetingLink", () => {
    it("finds who takes a service", () => {
        expect(
            staffFor("sv_1", [
                { id: "a", serviceIds: ["sv_1"] },
                { id: "b", serviceIds: ["sv_2"] },
            ]),
        ).toEqual(["a"]);
    });

    it("asks for the link online, and for Either, which may be online", () => {
        expect(needsMeetingLink("ONLINE")).toBe(true);
        expect(needsMeetingLink("EITHER")).toBe(true);
        expect(needsMeetingLink("IN_PERSON")).toBe(false);
    });
});

describe("At booking, they pay (E8)", () => {
    it("opens on the saved deposit, and a new service takes nothing", () => {
        expect(draft().deposit).toBe("PERCENT_50");
        expect(draftOf(null, [], "Asia/Kolkata").deposit).toBe("NONE");
    });

    it("works the split out from the price as typed, in the design's words", () => {
        expect(depositNote("NONE", "1200", "INR")).toBe(
            "No card needed to book. No-shows cost you the slot.",
        );
        expect(depositNote("PERCENT_25", "1,200", "INR")).toBe(
            "They pay ₹300 when booking, and the rest (₹900) at the visit. Refunded if they cancel in time.",
        );
        expect(depositNote("PERCENT_50", "999.99", "INR")).toBe(
            "They pay ₹500 when booking, and the rest (₹499.99) at the visit. Refunded if they cancel in time.",
        );
        expect(depositNote("FULL", "1200", "INR")).toBe(
            "They pay ₹1,200 when booking. Refunded if they cancel in time.",
        );
    });

    it("online only, nothing is left for the visit (DEC-088)", () => {
        expect(depositNote("NONE", "1200", "INR", 1, "ONLINE")).toBe(
            "They pay ₹1,200 online when booking: your booking rules take payment online only.",
        );
        expect(depositNote("NONE", "0", "INR", 1, "ONLINE")).toBe(
            "No card needed to book. No-shows cost you the slot.",
        );
        expect(depositNote("NONE", "1200", "INR", 1, "DESK")).toBe(
            "No card needed to book. No-shows cost you the slot.",
        );
    });

    it("refuses a deposit on a free service, as the API does", () => {
        expect(
            serviceProblems(
                draft({ price: "0", deposit: "PERCENT_25" }),
                false,
            ),
        ).toContain(
            "A deposit is part of the price. Set a price first, or take nothing at booking.",
        );
        expect(
            serviceProblems(draft({ price: "0", deposit: "NONE" }), false),
        ).not.toContain(
            "A deposit is part of the price. Set a price first, or take nothing at booking.",
        );
    });

    it("counts a changed deposit as a change to Price", () => {
        expect(changedSections(draft(), draft({ deposit: "FULL" }))).toEqual([
            "Price",
        ]);
    });
});

describe("visits (E10)", () => {
    it("reads a class as one visit, and never sends visits for one", () => {
        expect(draftOf(service({ capacity: 8 }), [], "UTC").visits).toBe("1");
        expect(
            serviceInput(draft({ kind: "class", places: "8" }), "INR").visits,
        ).toBe(1);
        expect(draftVisits({ kind: "one", visits: "" })).toBe(1);
        expect(draftVisits({ kind: "one", visits: "40" })).toBe(12);
    });

    it("refuses visits outside 1 to 12 on a one-to-one", () => {
        expect(serviceProblems(draft({ visits: "0" }), false)).toContain(
            "Visits has to be between 1 and 12.",
        );
        expect(serviceProblems(draft({ visits: "13" }), false)).toContain(
            "Visits has to be between 1 and 12.",
        );
        expect(
            serviceProblems(
                draft({ kind: "class", places: "8", visits: "0" }),
                false,
            ),
        ).not.toContain("Visits has to be between 1 and 12.");
    });

    it("refuses a treatment without a storefront, and says where to add one", () => {
        expect(serviceProblems(draft(), false, true)).toContain(
            TREATMENT_NEEDS_STOREFRONT,
        );
        expect(serviceProblems(draft({ visits: "1" }), false, true)).toEqual(
            [],
        );
        expect(serviceProblems(draft(), false, false)).toEqual([]);
    });

    it("says how the visits are booked, and the rest paid over them", () => {
        expect(timeNote("one", true, 3, 60)).toBe(
            "3 visits of 60 min, booked one at a time. The order is fulfilled after the last visit.",
        );
        expect(depositNote("PERCENT_50", "1200", "INR", 3)).toBe(
            "They pay ₹600 when booking, and the rest (₹600) over the visits. Refunded if they cancel in time.",
        );
    });

    it("counts a change of visits under Time", () => {
        expect(changedSections(draft(), draft({ visits: "4" }))).toEqual([
            "Time",
        ]);
    });
});
