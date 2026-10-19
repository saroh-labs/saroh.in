import { describe, expect, it } from "vitest";

import {
    EVERYONE,
    OPENS_DEFAULT,
    openingLayout,
    openingPerson,
    readOpens,
} from "./bookings-opens";

/**
 * Where Bookings opens (DEC-170): the view (Start Bookings on, else where
 * it was left on this device) and whose bookings (Show bookings for: the
 * last pick, Everyone until one, or Just me). The address always wins.
 */
describe("Start Bookings on", () => {
    it("is Where I left it by default: the device's last view, else Day", () => {
        expect(
            openingLayout({
                asked: undefined,
                start: "last",
                lastUsed: undefined,
            }),
        ).toBe("day");
        expect(
            openingLayout({
                asked: undefined,
                start: "last",
                lastUsed: "week",
            }),
        ).toBe("week");
        expect(
            openingLayout({
                asked: undefined,
                start: "last",
                lastUsed: "nonsense",
            }),
        ).toBe("day");
    });

    it("a fixed view wins over the device's last one; List is the agenda", () => {
        expect(
            openingLayout({ asked: undefined, start: "day", lastUsed: "week" }),
        ).toBe("day");
        expect(
            openingLayout({
                asked: undefined,
                start: "list",
                lastUsed: "week",
            }),
        ).toBe("agenda");
    });

    it("the address's view wins over both", () => {
        expect(
            openingLayout({ asked: "week", start: "day", lastUsed: "agenda" }),
        ).toBe("week");
    });
});

describe("Show bookings for", () => {
    const people = ["meera", "arjun"];

    it("opens on Everyone until someone is picked, then on the last pick", () => {
        expect(
            openingPerson({
                asked: undefined,
                opens: OPENS_DEFAULT,
                people,
                me: null,
            }),
        ).toBe(EVERYONE);
        expect(
            openingPerson({
                asked: undefined,
                opens: { ...OPENS_DEFAULT, lastPerson: "arjun" },
                people,
                me: null,
            }),
        ).toBe("arjun");
    });

    it("a last pick who no longer takes bookings reads as Everyone", () => {
        expect(
            openingPerson({
                asked: undefined,
                opens: { ...OPENS_DEFAULT, lastPerson: "gone" },
                people,
                me: null,
            }),
        ).toBe(EVERYONE);
    });

    it("Everyone always opens on everyone, whoever was picked last", () => {
        expect(
            openingPerson({
                asked: undefined,
                opens: { start: "last", showFor: "all", lastPerson: "arjun" },
                people,
                me: "meera",
            }),
        ).toBe(EVERYONE);
    });

    it("Just me opens on the viewer, or Everyone when they aren't on the diary", () => {
        const opens = {
            start: "last",
            showFor: "me",
            lastPerson: "arjun",
        } as const;
        expect(
            openingPerson({ asked: undefined, opens, people, me: "meera" }),
        ).toBe("meera");
        expect(
            openingPerson({ asked: undefined, opens, people, me: null }),
        ).toBe(EVERYONE);
    });

    it("the address's person wins, when they are on the diary", () => {
        const opens = {
            start: "last",
            showFor: "me",
            lastPerson: null,
        } as const;
        expect(
            openingPerson({ asked: "arjun", opens, people, me: "meera" }),
        ).toBe("arjun");
        expect(
            openingPerson({ asked: EVERYONE, opens, people, me: "meera" }),
        ).toBe(EVERYONE);
        expect(
            openingPerson({ asked: "gone", opens, people, me: "meera" }),
        ).toBe("meera");
    });
});

describe("what the API kept", () => {
    it("is read field by field, anything odd as the default", () => {
        expect(readOpens(null)).toEqual(OPENS_DEFAULT);
        expect(
            readOpens({ start: "week", showFor: "me", lastPerson: "arjun" }),
        ).toEqual({
            start: "week",
            showFor: "me",
            lastPerson: "arjun",
        });
        expect(
            readOpens({ start: "month", showFor: 3, lastPerson: "" }),
        ).toEqual(OPENS_DEFAULT);
    });
});
