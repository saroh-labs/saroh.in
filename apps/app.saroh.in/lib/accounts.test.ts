import { describe, expect, it, vi } from "vitest";

vi.mock("@/env", () => ({
    env: { NEXT_PUBLIC_ACCOUNTS_URL: "https://accounts.example.test" },
}));

import { inviteLandingFor } from "./accounts";

describe("inviteLandingFor (UX-029)", () => {
    it("opens an invitation link's own page on accounts", () => {
        expect(inviteLandingFor("/join/abc123")).toBe(
            "https://accounts.example.test/invite/abc123",
        );
        expect(inviteLandingFor("/join/abc123/")).toBe(
            "https://accounts.example.test/invite/abc123",
        );
    });

    it("leaves every other path to the login", () => {
        expect(inviteLandingFor("/")).toBeNull();
        expect(inviteLandingFor("/join")).toBeNull();
        expect(inviteLandingFor("/join/abc/extra")).toBeNull();
        expect(inviteLandingFor("/invitations/abc")).toBeNull();
    });
});
