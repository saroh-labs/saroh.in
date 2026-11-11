import { isMcpHost, mcpHostAllows, mcpHostOnly } from "./mcp-host";

describe("mcpHostOnly (U10)", () => {
    it("serves only /mcp and the OAuth discovery documents on an MCP address", () => {
        expect(isMcpHost("mcp.saroh.in")).toBe(true);
        expect(isMcpHost("api.saroh.in")).toBe(false);
        for (const ok of [
            "/mcp",
            "/.well-known/oauth-protected-resource",
            "/.well-known/oauth-protected-resource/mcp",
            "/.well-known/oauth-authorization-server/api/auth",
        ]) {
            expect(mcpHostAllows(ok)).toBe(true);
        }
        for (const no of [
            "/api/auth/oauth2/token",
            "/health",
            "/v1/products",
            "/organizations/x/sites",
            "/mcpx",
            "/public/sites",
        ]) {
            expect(mcpHostAllows(no)).toBe(false);
        }
    });

    it("answers 404 for anything else there, and passes other addresses untouched", () => {
        const run = (host: string, path: string) => {
            const next = jest.fn();
            const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
            mcpHostOnly(
                { headers: { host }, path } as never,
                res as never,
                next,
            );
            return {
                next: next.mock.calls.length,
                status: res.status.mock.calls[0]?.[0],
            };
        };
        expect(run("mcp.saroh.in", "/api/auth/sign-in")).toEqual({
            next: 0,
            status: 404,
        });
        expect(run("mcp.saroh.in", "/mcp")).toEqual({
            next: 1,
            status: undefined,
        });
        expect(run("api.saroh.in", "/api/auth/sign-in")).toEqual({
            next: 1,
            status: undefined,
        });
    });
});
