import { describe, expect, it } from "vitest";

import {
    chooseNotice,
    chooserGroups,
    chooserSkips,
    lifecycleLabel,
    NOT_YOURS_HREF,
} from "./choose";

/** "Which business?" and the door that opens one (UX-084). */
describe("lifecycleLabel", () => {
    it("says nothing for an open business, or one from an older API", () => {
        expect(lifecycleLabel("ACTIVE")).toBeNull();
        expect(lifecycleLabel(undefined)).toBeNull();
    });

    it("names each state that takes no new activity", () => {
        expect(lifecycleLabel("SUSPENDED")).toBe("Suspended");
        expect(lifecycleLabel("PENDING_DELETION")).toBe("Closing");
        expect(lifecycleLabel("DELETED_RETAINED")).toBe("Closed");
    });

    it("never shows a state it doesn't know as a live business", () => {
        expect(lifecycleLabel("ARCHIVED")).toBe("Not open");
    });
});

describe("chooserGroups", () => {
    const orgs = [
        { id: "own", role: "OWNER", lifecycleStatus: "ACTIVE" },
        { id: "theirs", role: "ADMIN" },
        { id: "retired", role: "OWNER", lifecycleStatus: "PENDING_DELETION" },
        { id: "held", role: "MEMBER", lifecycleStatus: "SUSPENDED" },
    ];

    it("lists a business that isn't open apart from the live ones", () => {
        const g = chooserGroups(orgs);
        expect(g.owned.map((o) => o.id)).toEqual(["own"]);
        expect(g.invited.map((o) => o.id)).toEqual(["theirs"]);
        expect(g.closed.map((o) => o.id)).toEqual(["retired", "held"]);
    });
});

describe("a link to a business you're not in", () => {
    it("goes back to the chooser with a line that says why", () => {
        expect(NOT_YOURS_HREF).toBe("/choose?notice=not-yours");
        expect(chooseNotice("not-yours")).toMatch(
            /^That link opens a business you're not in/,
        );
    });

    it("says nothing for any other visit", () => {
        expect(chooseNotice(undefined)).toBeNull();
        expect(chooseNotice("something")).toBeNull();
        expect(chooseNotice(["not-yours", "x"])).toBeNull();
    });
});

describe("chooserSkips", () => {
    it("steps out of the way with one business, or none", () => {
        expect(chooserSkips(1, null)).toBe("/");
        expect(chooserSkips(0, null)).toBe("/onboarding");
        expect(chooserSkips(2, null)).toBeNull();
    });

    it("stays to say why a link didn't open, however many there are", () => {
        expect(chooserSkips(1, "That link…")).toBeNull();
        expect(chooserSkips(0, "That link…")).toBeNull();
    });
});
