import { describe, expect, it } from "vitest";

import {
    AI_APPS,
    CONNECT_IN,
    liveAiApps,
    mcpAddressOf,
    offersAssistantWayIn,
} from "./mcp-address";

describe("the MCP address", () => {
    it("follows the API's own host, so each edition names its own", () => {
        expect(mcpAddressOf("https://api.example.in")).toBe(
            "https://mcp.example.in/mcp",
        );
        expect(mcpAddressOf("https://api.example.tech/")).toBe(
            "https://mcp.example.tech/mcp",
        );
    });

    it("is unknown without an api. host", () => {
        expect(mcpAddressOf("http://localhost:3333")).toBeNull();
        expect(mcpAddressOf(undefined)).toBeNull();
        expect(mcpAddressOf("not a url")).toBeNull();
    });
});

describe("the AI apps offered", () => {
    it("are only the apps walked on dev: Claude and ChatGPT for now", () => {
        expect(liveAiApps().map((app) => app.key)).toEqual([
            "claude",
            "chatgpt",
        ]);
        expect(AI_APPS.find((app) => app.key === "perplexity")?.liveOnDev).toBe(
            false,
        );
    });

    it("open Claude's and ChatGPT's own settings, the others their help part", () => {
        const at = (key: string) =>
            AI_APPS.find((app) => app.key === key)?.connectIn;
        expect(at("claude")).toBe(CONNECT_IN.claude);
        expect(at("chatgpt")).toBe(CONNECT_IN.chatgpt);
        for (const app of AI_APPS.filter((a) => !(a.key in CONNECT_IN))) {
            expect(app.connectIn).toMatch(
                new RegExp(`/help/connect-other-ai-apps#${app.key}$`),
            );
        }
    });
});

describe("the Website line's way in", () => {
    const mine = { person: { id: "me" } };
    const theirs = { person: { id: "them" } };

    it("is offered while this person has no assistant connected", () => {
        expect(offersAssistantWayIn([], "me")).toBe(true);
        expect(offersAssistantWayIn([theirs], "me")).toBe(true);
    });

    it("is gone once they have one, or when the list can't be read", () => {
        expect(offersAssistantWayIn([theirs, mine], "me")).toBe(false);
        expect(offersAssistantWayIn(null, "me")).toBe(false);
    });
});
