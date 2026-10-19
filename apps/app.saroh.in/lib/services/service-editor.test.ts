import { describe, expect, it } from "vitest";

import type { Service } from "./service";
import type { ServiceDraft } from "./service-editor";
import {
    changedParts,
    changedSections,
    depositNote,
    draftOf,
    draftVisits,
    fromMinor,
    glance,
    gstPlace,
    hasBookableHours,
    HOURS_SECTION,
    hoursNote,
    needsGstRate,
    needsMeetingLink,
    problemFor,
    savedMessage,
    serviceFieldProblems,
    serviceInput,
    serviceProblems,
    serviceUpdate,
    staffFor,
    staffNote,
    timeNote,
    timesComeFrom,
    toMinor,
    TREATMENT_NEEDS_STOREFRONT,
    VIEW_ONLY,
    whereNote,
    whoseHours,
} from "./service-editor";

describe("VIEW_ONLY (E26)", () => {
    it("says the role can't change set-up, in words, with no permission code", () => {
        expect(VIEW_ONLY).toBe(
            "View only. Your role can't change services, hours or booking rules.",
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
    bookableByTeam: true,
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
            gstPriceMode: "",
            staffIds: ["st_a", "st_b"],
            showOnBookingPage: true,
            bookableByTeam: true,
            timezone: "Asia/Kolkata",
            bufferBefore: "5",
            gstRate: "18",
            sacCode: "999723",
            hours: [],
        });
    });

    it("reads a class, a team-only service, and an Either link", () => {
        const d = draftOf(
            service({
                capacity: 12,
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
            bookableByTeam: true,
            showOnBookingPage: false,
            where: "EITHER",
            meetingUrl: "https://meet.example/x",
        });
    });

    it("starts a new one at 60 minutes, a 15-minute break after, in person, bookable by both, in the business's zone (U16)", () => {
        expect(draftOf(null, [], "Asia/Kolkata")).toMatchObject({
            name: "",
            minutes: "60",
            gap: "15",
            where: "IN_PERSON",
            showOnBookingPage: true,
            bookableByTeam: true,
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
            "The break after has to be a number of minutes.",
            "Add a price, or 0 if it's free.",
            "Pick who does it.",
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
            "The break before has to be a number of minutes.",
            "Pick a time zone.",
            "A SAC code is 4 to 8 digits.",
        ]);
    });
});

describe("the GST rate of a GST-registered business's service", () => {
    const NEEDED = "Choose a GST rate. Pick 0% if it's exempt or nil-rated.";
    const problems = (over: Partial<ServiceDraft>, registered: boolean) =>
        serviceProblems(draft(over), true, false, false, registered);

    it("has to be chosen before a priced service is saved", () => {
        expect(problems({ gstRate: "" }, true)).toEqual([NEEDED]);
        expect(
            problemFor(
                serviceFieldProblems(
                    draft({ gstRate: "" }),
                    true,
                    false,
                    false,
                    true,
                ),
                "gstRate",
            ),
        ).toBe(NEEDED);
    });

    it("takes 0% as an answer: exempt is a choice, never the same as none", () => {
        expect(problems({ gstRate: "0" }, true)).toEqual([]);
        expect(problems({ gstRate: "18" }, true)).toEqual([]);
        expect(needsGstRate({ price: "1200", gstRate: "0" }, true)).toBe(false);
    });

    it("is never asked of a free service, or one with no price typed yet", () => {
        expect(
            problems({ gstRate: "", price: "0", deposit: "NONE" }, true),
        ).toEqual([]);
        expect(needsGstRate({ price: "", gstRate: "" }, true)).toBe(false);
        expect(needsGstRate({ price: "twelve", gstRate: "" }, true)).toBe(
            false,
        );
    });

    it("is never asked of a business that isn't registered", () => {
        expect(problems({ gstRate: "" }, false)).toEqual([]);
        expect(needsGstRate({ price: "1200", gstRate: "" }, false)).toBe(false);
    });

    it("sits beside the price for a registered business, and nowhere for one that isn't", () => {
        const none = { gstRate: "", sacCode: "" };
        expect(gstPlace(true, none)).toBe("price");
        expect(gstPlace(false, none)).toBe("none");
        // One saved before stays in view (00-universal §15).
        expect(gstPlace(false, { gstRate: "18", sacCode: "" })).toBe("more");
        expect(gstPlace(false, { gstRate: "", sacCode: "999723" })).toBe(
            "more",
        );
        // Couldn't tell: where it always was, and nothing is asked.
        expect(gstPlace(null, none)).toBe("more");
    });

    it("names a change to it under Money, and the break before under Time and place", () => {
        const saved = draft();
        const changed = { ...saved, gstRate: "5", sacCode: "9997" };
        expect(changedSections(saved, changed)).toEqual(["Money"]);
        expect(
            changedSections(saved, { ...changed, bufferBefore: "20" }),
        ).toEqual(["Time and place", "Money"]);
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
            gstPriceMode: null,
            timezone: "Asia/Kolkata",
            locationType: "EITHER",
            meetingUrl: "https://meet.x/y",
            showOnBookingPage: true,
            bookableByTeam: true,
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

    it("an update leaves who can book it to its ticks, which save on their own (U16)", () => {
        const update = serviceUpdate(
            draft({ showOnBookingPage: false, bookableByTeam: false }),
            "INR",
        );
        expect(update).not.toHaveProperty("status");
        expect(update).not.toHaveProperty("showOnBookingPage");
        expect(update).not.toHaveProperty("bookableByTeam");
        expect(update.name).toBe("Personal training");
    });

    it("a new one is sent who can book it", () => {
        expect(
            serviceInput(
                draft({ showOnBookingPage: false, bookableByTeam: true }),
                "INR",
            ),
        ).toMatchObject({ showOnBookingPage: false, bookableByTeam: true });
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
                bookableByTeam: false,
            }),
        ).toEqual(["What it is", "Time and place", "Money", "Who can book it"]);
    });
});

describe("the words around the editor", () => {
    it("says what saving did to bookings already made", () => {
        expect(
            savedMessage({
                isNew: true,
                name: "Check-up",
                kind: "one",
                comingUp: 0,
            }),
        ).toBe(
            "Check-up added. Give it weekly hours so customers can book it.",
        );
        expect(
            savedMessage({
                isNew: true,
                name: "Check-up",
                kind: "one",
                comingUp: 0,
                hasPerson: true,
            }),
        ).toBe(
            "Check-up added. Customers can book it in the free time of who does it.",
        );
        expect(
            savedMessage({
                isNew: true,
                name: "Yoga",
                kind: "class",
                comingUp: 0,
            }),
        ).toBe("Yoga added. Give it weekly times so customers can book it.");
        expect(
            savedMessage({ isNew: false, name: "x", kind: "one", comingUp: 2 }),
        ).toBe(
            "Saved. New bookings use it, and 2 bookings already made keep the old details.",
        );
        expect(
            savedMessage({ isNew: false, name: "x", kind: "one", comingUp: 0 }),
        ).toBe("Saved. New bookings use it. Nothing already booked changes.");
        expect(
            savedMessage({
                isNew: false,
                name: "x",
                kind: "one",
                comingUp: null,
            }),
        ).toContain("Bookings already made keep their details");
    });

    it("explains time, where, and who does it", () => {
        expect(timeNote("class", true)).toBe(
            "A class runs at set times, and people book a place.",
        );
        // The hours have a card of their own, which says where the times
        // come from: Time says only what the gap does.
        expect(timeNote("one", false)).toBe(
            "The gap is kept free after each booking.",
        );
        expect(whereNote("EITHER")).toBe(
            "They pick when booking. Online visits join by the link below.",
        );
        expect(hasBookableHours("one", 0, 0)).toBe(false);
        expect(hasBookableHours("one", 0, 1)).toBe(true);
        expect(hasBookableHours("class", 0, 1)).toBe(false);
        expect(hasBookableHours("class", 2, 0)).toBe(true);
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
            "No card needed to book. If they don't come, you lose the time.",
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
            "No card needed to book. If they don't come, you lose the time.",
        );
        expect(depositNote("NONE", "1200", "INR", 1, "DESK")).toBe(
            "No card needed to book. If they don't come, you lose the time.",
        );
    });

    it("at the desk only, a deposit is paid at the visit too (DEC-089)", () => {
        expect(depositNote("PERCENT_50", "1200", "INR", 1, "DESK")).toBe(
            "They pay ₹1,200 at the visit.",
        );
        expect(depositNote("FULL", "1200", "INR", 3, "DESK")).toBe(
            "They pay ₹1,200 over the visits.",
        );
        expect(depositNote("PERCENT_50", "1200", "INR", 1, "BOTH")).toBe(
            "They pay ₹600 when booking, and the rest (₹600) at the visit. Refunded if they cancel in time.",
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

    it("counts a changed deposit as a change to Money", () => {
        expect(changedSections(draft(), draft({ deposit: "FULL" }))).toEqual([
            "Money",
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

    it("counts a change of visits under Money, beside the price it divides", () => {
        expect(changedSections(draft(), draft({ visits: "4" }))).toEqual([
            "Money",
        ]);
    });
});

describe("who takes it, with one person on the diary", () => {
    it("a new service starts with the one person on it", () => {
        expect(draftOf(null, ["p1"], "Asia/Kolkata").staffIds).toEqual(["p1"]);
        expect(draftOf(null, [], "Asia/Kolkata").staffIds).toEqual([]);
    });

    it("is not asked for when there is nobody to choose between", () => {
        const named = { ...draftOf(null, [], "Asia/Kolkata"), name: "Trim" };
        expect(serviceProblems(named, true, false, true)).not.toContain(
            "Pick who does it.",
        );
        // With two or more on the diary it still is.
        expect(serviceProblems(named, true, false, false)).toContain(
            "Pick who does it.",
        );
    });
});

describe("its own weekly hours are part of the draft (one Save)", () => {
    const MON = { dayOfWeek: 1, start: "09:00", end: "18:00" };
    const TUE = { dayOfWeek: 2, start: "09:00", end: "18:00" };

    it("opens with the hours it is handed: saved ones, or what a new one starts with", () => {
        expect(draftOf(service(), [], "UTC", [MON]).hours).toEqual([MON]);
        expect(draftOf(null, [], "UTC", [MON, TUE]).hours).toEqual([MON, TUE]);
        expect(draftOf(null, [], "UTC").hours).toEqual([]);
    });

    it("names them as their own section when they change, whatever the order", () => {
        const saved = draft({ hours: [MON, TUE] });
        expect(changedSections(saved, draft({ hours: [TUE, MON] }))).toEqual(
            [],
        );
        expect(changedSections(saved, draft({ hours: [MON] }))).toEqual([
            HOURS_SECTION,
        ]);
    });

    it("says which call each change goes in, so Try again sends only what is left", () => {
        const saved = draft({ hours: [MON] });
        expect(changedParts(saved, saved)).toEqual({
            fields: false,
            who: false,
            hours: false,
        });
        expect(changedParts(saved, draft({ hours: [MON, TUE] }))).toEqual({
            fields: false,
            who: false,
            hours: true,
        });
        expect(
            changedParts(saved, { ...saved, name: "Other", staffIds: [] }),
        ).toEqual({ fields: true, who: true, hours: false });
        // Who can book it is the service's own field.
        expect(
            changedParts(saved, { ...saved, bookableByTeam: false }).fields,
        ).toBe(true);
    });

    it("refuses a window that ends before it starts, by its row", () => {
        const bad = draft({
            hours: [MON, { dayOfWeek: 3, start: "18:00", end: "09:00" }],
        });
        const problems = serviceFieldProblems(bad, true);
        expect(problems).toEqual([
            {
                field: "hours",
                row: 1,
                message:
                    "Wednesday's hours end before they start. Choose a later end.",
            },
        ]);
        expect(problemFor(problems, "hours", 0)).toBeNull();
        expect(problemFor(problems, "hours", 1)).toBe(
            "Wednesday's hours end before they start. Choose a later end.",
        );
        expect(serviceProblems(bad, true)).toEqual([
            "Wednesday's hours end before they start. Choose a later end.",
        ]);
    });

    it("says a new one with hours of its own can be booked in them", () => {
        expect(
            savedMessage({
                isNew: true,
                name: "Check-up",
                kind: "one",
                comingUp: 0,
                hasHours: true,
            }),
        ).toBe("Check-up added. Customers can book it in its weekly hours.");
        expect(
            savedMessage({
                isNew: true,
                name: "Yoga",
                kind: "class",
                comingUp: 0,
                hasPerson: true,
                hasHours: true,
            }),
        ).toBe("Yoga added. Customers can book it in its weekly hours.");
        // Someone takes a one-to-one: their free time is still the answer.
        expect(
            savedMessage({
                isNew: true,
                name: "Check-up",
                kind: "one",
                comingUp: 0,
                hasPerson: true,
                hasHours: true,
            }),
        ).toBe(
            "Check-up added. Customers can book it in the free time of who does it.",
        );
    });

    it("says over the rows that they go with the page's Save, and where a new one's came from", () => {
        expect(hoursNote("Asia/Kolkata", true)).toBe(
            "Weekly windows in Asia/Kolkata, saved with the rest of the page. They start from your opening hours: change them if this runs at other times.",
        );
        expect(hoursNote("Asia/Kolkata", false)).toBe(
            "Weekly windows in Asia/Kolkata, saved with the rest of the page.",
        );
        // Someone takes it: its own hours only narrow theirs.
        expect(hoursNote("Asia/Kolkata", false, true)).toBe(
            "Weekly windows in Asia/Kolkata, saved with the rest of the page. Only the free time inside these windows is offered.",
        );
    });

    it("says what gives a service its times: its own hours, or the people who take it", () => {
        expect(timesComeFrom("one", 0)).toBe("own");
        expect(timesComeFrom("one", 2)).toBe("people");
        // A class runs at its own times, whoever teaches it.
        expect(timesComeFrom("class", 0)).toBe("own");
        expect(timesComeFrom("class", 1)).toBe("own");
        expect(whoseHours(["Asha"])).toBe("Asha's hours");
        expect(whoseHours(["Asha", "Ravi"])).toBe("Asha's and Ravi's hours");
        expect(whoseHours(["Asha", "Ravi", "Mo"])).toBe(
            "the hours of the 3 people who take it",
        );
        expect(HOURS_SECTION).toBe("When it can be booked");
    });
});

describe("serviceFieldProblems", () => {
    it("puts each problem on its field, in the order the page reads", () => {
        const problems = serviceFieldProblems(
            draft({ name: " ", minutes: "2", price: "", sacCode: "12" }),
            true,
        );
        expect(problems.map((p) => p.field)).toEqual([
            "name",
            "minutes",
            "price",
            "sacCode",
        ]);
        expect(problemFor(problems, "name")).toBe("Add a name.");
        expect(problemFor(problems, "gap")).toBeNull();
        // The same sentences the strip under the header reads out.
        expect(problems.map((p) => p.message)).toEqual(
            serviceProblems(
                draft({ name: " ", minutes: "2", price: "", sacCode: "12" }),
                true,
            ),
        );
    });
});
