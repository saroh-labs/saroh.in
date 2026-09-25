import { describe, expect, it } from "vitest";

import { mayNavigate, onLeaveRequest } from "./leave-request";

describe("a navigation made in code", () => {
    it("goes when nothing holds the page", () => {
        expect(mayNavigate("/settings/team", new EventTarget())).toBe(true);
    });

    it("is held by an open edit, which is told where it was going", () => {
        const page = new EventTarget();
        const asked: string[] = [];
        const off = onLeaveRequest((href) => {
            asked.push(href);
            return true;
        }, page);
        expect(mayNavigate("/settings/team", page)).toBe(false);
        expect(asked).toEqual(["/settings/team"]);

        // The edit closed: nothing holds it any more.
        off();
        expect(mayNavigate("/settings/team", page)).toBe(true);
    });

    it("goes when the edit lets it (a link that stays on the page)", () => {
        const page = new EventTarget();
        onLeaveRequest(() => false, page);
        expect(mayNavigate("/settings/business#tax", page)).toBe(true);
    });
});
