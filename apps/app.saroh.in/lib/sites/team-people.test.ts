// Our team's People list (round 3): one list, the first as the block's own.
import { describe, expect, it } from "vitest";

import { isEmptyTeam, membersOf, syncChosen, withMembers } from "./team-people";

const content = {
    variant: "team",
    title: "Our team",
    staffId: "st_1",
    name: "Asha Rao",
    role: "Warehouse lead",
    people: [{ name: "Typed", role: "Guest" }],
} as Parameters<typeof membersOf>[0];

describe("team people", () => {
    it("reads the block's own person first, then the others", () => {
        expect(membersOf(content).map((m) => m.name)).toEqual([
            "Asha Rao",
            "Typed",
        ]);
    });

    it("writes a new order back, the first as the block's own", () => {
        const [a, b] = membersOf(content);
        const out = withMembers(content, [b, a]);
        expect(out).toMatchObject({
            title: "Our team",
            name: "Typed",
            role: "Guest",
            people: [{ staffId: "st_1", name: "Asha Rao" }],
        });
        expect(out.staffId).toBeUndefined();
    });

    it("after the picker: keeps the typed-in, drops the unchosen, adds the new at the end", () => {
        const out = syncChosen(membersOf(content), [
            { id: "st_2", name: "Farah Sheikh", title: "Trade accounts" },
        ]);
        expect(out).toEqual([
            { name: "Typed", role: "Guest" },
            { staffId: "st_2", name: "Farah Sheikh", role: "Trade accounts" },
        ]);
    });

    it("keeps a chosen person's place and words", () => {
        const out = syncChosen(membersOf(content), [
            { id: "st_1", name: "Asha", title: "Other" },
        ]);
        expect(out[0]).toMatchObject({
            staffId: "st_1",
            role: "Warehouse lead",
        });
    });

    it("lets everyone go, leaving the team look empty (ER3 bug 1)", () => {
        expect(syncChosen([{ staffId: "st_1", name: "A" }], [])).toEqual([]);
        const empty = withMembers(content, []);
        expect(empty).toMatchObject({ variant: "team", title: "Our team" });
        expect(empty.name).toBe("");
        expect(empty.staffId).toBeUndefined();
        expect(empty.people).toBeUndefined();
        expect(membersOf(empty)).toEqual([]);
    });

    it("knows an empty Our team, and only that (canvas placeholder)", () => {
        const empty = withMembers(content, []);
        expect(isEmptyTeam({ type: "person", content: empty })).toBe(true);
        expect(isEmptyTeam({ type: "person", content })).toBe(false);
        expect(isEmptyTeam({ type: "person", content: { name: "" } })).toBe(
            false,
        );
        expect(isEmptyTeam({ type: "hero", content: empty })).toBe(false);
    });
});
