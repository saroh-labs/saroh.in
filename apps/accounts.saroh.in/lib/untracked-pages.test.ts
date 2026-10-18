import { describe, expect, it } from "vitest";

import { untrackedPage } from "./untracked-pages";

describe("untrackedPage", () => {
    it("leaves out the staff invite's page and its swap route", () => {
        expect(untrackedPage("/staff-invite")).toBe(true);
        expect(untrackedPage("/staff-invite/open?token=abc")).toBe(true);
        expect(
            untrackedPage(
                "https://accounts.saroh.in/staff-invite/open?token=x",
            ),
        ).toBe(true);
    });

    it("tracks every other page", () => {
        expect(untrackedPage("/login")).toBe(false);
        expect(untrackedPage("/staff-invites-elsewhere")).toBe(false);
        expect(untrackedPage("/invite/abc")).toBe(false);
        expect(untrackedPage(null)).toBe(false);
    });
});
