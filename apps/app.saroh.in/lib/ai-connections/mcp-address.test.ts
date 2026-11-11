import { describe, expect, it } from "vitest";

import { mcpAddressOf } from "./mcp-address";

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
