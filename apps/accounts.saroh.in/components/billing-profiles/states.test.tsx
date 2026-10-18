// @vitest-environment jsdom
/**
 * The Billing profiles states (F7): loading, no profiles yet, a teammate
 * who owns none, and a read that failed, in the design's words.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    EmptyProfiles,
    FailedProfiles,
    LoadingProfiles,
    TeammateState,
    teammateSays,
} from "./states";
import { button, draw, host, press, setUp, tearDown, text } from "./test-kit";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }),
}));

beforeEach(() => {
    setUp();
    refresh.mockReset();
});
afterEach(tearDown);

describe("states", () => {
    it("loading is a status, named for a screen reader", () => {
        draw(<LoadingProfiles />);
        const status = host.querySelector("[role=status]");
        expect(status?.getAttribute("aria-busy")).toBe("true");
        expect(text(status)).toContain("Loading your billing profiles");
    });

    it("no profiles yet says how the first is made, and links to create a business", () => {
        draw(
            <EmptyProfiles createUrl="https://app.saroh.localhost/onboarding" />,
        );
        expect(text(host)).toContain("No billing profiles yet");
        expect(text(host)).toContain(
            "Your first one is made when you create a business, from its details. Nothing is charged until you pick a paid plan.",
        );
        expect(button("Create a business", host).getAttribute("href")).toBe(
            "https://app.saroh.localhost/onboarding",
        );
    });

    it("a teammate reads whose billing it is", () => {
        draw(<TeammateState businesses={["Pulse Fitness Rohtak"]} />);
        expect(text(host)).toContain("You don't pay for any business");
        expect(text(host)).toContain(
            "You're on the team at Pulse Fitness Rohtak. Its owner pays Saroh, so its billing is theirs to see. Your own profiles appear here when you create a business.",
        );
        expect(teammateSays(["A", "B"])).toContain(
            "You're on the team at A and B. Their owners pay Saroh, so their billing",
        );
    });

    it("a failed read says nothing changed, and Try again reads again", async () => {
        draw(<FailedProfiles />);
        expect(host.querySelector("[role=alert]")).toBeTruthy();
        expect(text(host)).toContain("Couldn't load your billing profiles");
        expect(text(host)).toContain("Nothing has been changed.");
        await press(button("Try again", host));
        expect(refresh).toHaveBeenCalled();
    });
});
