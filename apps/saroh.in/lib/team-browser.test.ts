import { describe, expect, it } from "vitest";

import { isTeamBrowser } from "./team-browser";

describe("isTeamBrowser", () => {
    it("is the team's with the cookie, wherever it sits", () => {
        expect(isTeamBrowser("saroh_team=1")).toBe(true);
        expect(isTeamBrowser("_ga=GA1.1; saroh_team=1; x=2")).toBe(true);
    });

    it("isn't without it, or with another value or a lookalike name", () => {
        expect(isTeamBrowser("")).toBe(false);
        expect(isTeamBrowser("saroh_team=0")).toBe(false);
        expect(isTeamBrowser("not_saroh_team=1")).toBe(false);
        expect(isTeamBrowser("saroh_team=10")).toBe(false);
    });
});
