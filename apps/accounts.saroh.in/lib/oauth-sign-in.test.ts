import { describe, expect, it } from "vitest";

import {
    appName,
    OAUTH_WORDS,
    oauthQueryOf,
    signInFirst,
} from "./oauth-sign-in";
import { untrackedPage } from "./untracked-pages";

describe("an AI app's sign-in pages (U9)", () => {
    it("hands the signed request back whole, repeated keys and all", () => {
        const query = oauthQueryOf({
            client_id: "https://claude.ai/oauth/mcp-oauth-client-metadata",
            resource: ["https://mcp.saroh.in/mcp", "https://other.example/x"],
            sig: "abc",
            unset: undefined,
        });
        const back = new URLSearchParams(query);
        expect(back.get("client_id")).toBe(
            "https://claude.ai/oauth/mcp-oauth-client-metadata",
        );
        expect(back.getAll("resource")).toHaveLength(2);
        expect(back.get("sig")).toBe("abc");
        expect(back.has("unset")).toBe(false);
    });

    it("signs a signed-out person in and brings them back to the same step", () => {
        const to = signInFirst("/oauth/pick-business", "a=1&sig=x");
        const redirect = new URL(
            to,
            "https://accounts.saroh.in",
        ).searchParams.get("redirect");
        expect(redirect).toBe("/oauth/pick-business?a=1&sig=x");
    });

    it("never names an app it doesn't have a name for, and says where the data goes", () => {
        expect(appName({ app: { name: "  ", known: false } })).toBe("This app");
        expect(appName({ app: { name: "Cursor", known: false } })).toBe(
            "Cursor",
        );
        expect(OAUTH_WORDS.dataLine("Claude")).toContain("Claude's provider");
        expect(OAUTH_WORDS.unverified).toBe("Unverified app");
    });

    it("names one ticked business, and counts several", () => {
        expect(OAUTH_WORDS.consentTitle("Claude", ["Rye Bakery"])).toBe(
            "Let Claude work with Rye Bakery?",
        );
        expect(
            OAUTH_WORDS.consentTitle("Claude", ["Rye Bakery", "Pulse Gym"]),
        ).toBe("Let Claude work with 2 businesses?");
        expect(OAUTH_WORDS.allBusinesses).toBe("All my businesses");
    });

    it("keeps the pages out of error tracking", () => {
        expect(untrackedPage("/oauth/consent?client_id=x&sig=y")).toBe(true);
        expect(untrackedPage("/oauthish")).toBe(false);
    });
});
