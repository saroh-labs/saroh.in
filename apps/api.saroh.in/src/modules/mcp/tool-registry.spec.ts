jest.mock("../../common/auth/auth", () => ({ authFor: jest.fn() }));
jest.mock("@saroh/auth", () => ({ MCP_IDLE_SECONDS: 1 }));

import {
    ForbiddenException,
    InternalServerErrorException,
    NotFoundException,
} from "@nestjs/common";
import { z } from "zod";

import type { McpActivityService } from "./activity.service";
import type { McpConnection } from "./mcp-auth.guard";
import { withBodyVersion } from "./mcp.controller";
import {
    defineTool,
    McpToolRegistry,
    READ_ONLY,
    ToolError,
    toolError,
} from "./tool-registry";

const textOf = (r: ReturnType<typeof toolError>) => r.content[0].text;

describe("MCP tool framework (U10)", () => {
    it("refuses a tool name or description an AI would use badly", () => {
        const base = {
            title: "T",
            contract: { input: z.object({}), output: z.object({}) },
            capability: null,
            hints: READ_ONLY,
            run: () => Promise.resolve({ text: "", data: {} }),
        };
        expect(() =>
            defineTool({
                ...base,
                name: "GetThing",
                description: "Use this when x",
            }),
        ).toThrow(/verb_noun/);
        expect(() =>
            defineTool({
                ...base,
                name: "get_thing",
                description: "Gets a thing",
            }),
        ).toThrow(/Use this when/);
    });

    it("turns every throw into an isError result with a next step, never a stack", () => {
        expect(
            textOf(toolError(new ToolError("Taken.", "Pick 15:30."), "t")),
        ).toBe("Taken. Next: Pick 15:30.");
        expect(
            textOf(
                toolError(
                    new ForbiddenException({ message: "Only an owner." }),
                    "t",
                ),
            ),
        ).toMatch(/^Only an owner\. Next: .*Saroh app/);
        expect(
            textOf(
                toolError(
                    new NotFoundException({
                        error: {
                            code: "not_found",
                            message: "No such product.",
                        },
                    }),
                    "t",
                ),
            ),
        ).toMatch(/^No such product\. Next: Check the id/);
        const logger = { error: jest.fn() };
        const crash = toolError(
            new Error("connection reset at pg/lib/client.js:12"),
            "t",
            logger as never,
        );
        expect(crash.isError).toBe(true);
        expect(textOf(crash)).not.toMatch(/pg|connection reset/);
        expect(
            textOf(toolError(new InternalServerErrorException("db down"), "t")),
        ).not.toMatch(/db down/);
        expect(logger.error).toHaveBeenCalled();
    });

    it("mends a 2026-07-28 body sent under a 2025-11-25 header, and leaves a match alone", () => {
        const req = (v: string) =>
            new Request("https://mcp.saroh.in/mcp", {
                method: "POST",
                headers: { "mcp-protocol-version": v },
            });
        const body = {
            method: "tools/list",
            params: {
                _meta: {
                    "io.modelcontextprotocol/protocolVersion": "2026-07-28",
                },
            },
        };
        expect(
            withBodyVersion(req("2025-11-25"), body).headers.get(
                "mcp-protocol-version",
            ),
        ).toBe("2026-07-28");
        const same = req("2026-07-28");
        expect(withBodyVersion(same, body)).toBe(same);
        const init = req("2025-11-25");
        expect(
            withBodyVersion(init, {
                method: "initialize",
                params: { protocolVersion: "2025-11-25" },
            }),
        ).toBe(init);
    });

    it("adds a business argument to every tool, reads it, and hands the tool only its own input", async () => {
        const registry = new McpToolRegistry({} as McpActivityService);
        const run = jest.fn((input: unknown) =>
            Promise.resolve({ text: "ok", data: { seen: input } }),
        );
        const tool = defineTool({
            name: "get_thing",
            title: "T",
            description: "Use this when x",
            contract: {
                input: z.object({ id: z.string() }).strict(),
                output: z.object({ seen: z.unknown() }),
            },
            capability: null,
            hints: READ_ONLY,
            run,
        });
        registry.register(tool);
        expect(() =>
            registry.register(
                defineTool({
                    ...tool,
                    name: "own_business",
                    contract: {
                        input: z.object({ business: z.string() }),
                        output: z.object({}),
                    },
                }),
            ),
        ).toThrow(/registry adds it/);

        const ctx = { organizationId: "b", userId: "u", role: "OWNER" };
        const connection = {
            kind: "oauth",
            id: "g",
            clientId: "c",
            clientName: null,
            scopes: [],
            userId: "u",
            businesses: ["a", "b"],
        } as McpConnection;
        const contextIn = (id: string) =>
            Promise.resolve(id === "b" ? { ...ctx, organizationId: id } : null);

        const none = await registry.target(
            connection,
            tool,
            undefined,
            contextIn,
        );
        expect(none).toBeInstanceOf(ToolError);
        expect((none as ToolError).nextStep).toMatch(/list_businesses/);
        // Ticked, but the person can't reach it now.
        expect(
            await registry.target(connection, tool, "a", contextIn),
        ).toBeInstanceOf(ToolError);
        const inB = await registry.target(connection, tool, "b", contextIn);
        expect(inB).toMatchObject({
            ctx: { organizationId: "b" },
            named: true,
        });

        const answer = await registry.call(
            tool,
            { id: "1", business: "b" },
            inB as never,
            null,
        );
        expect(answer).toMatchObject({
            structuredContent: { seen: { id: "1" } },
        });
        // A NUL character never reaches the tool or Postgres.
        const nul = await registry.call(
            tool,
            { id: "a\u0000b" },
            inB as never,
            null,
        );
        expect(nul).toMatchObject({ isError: true });
        expect(textOf(nul as never)).toMatch(/^id contains a NUL character/);
        expect(run).toHaveBeenCalledTimes(1);
        expect(
            await registry.target(connection, tool, "slug\u0000", contextIn),
        ).toBeInstanceOf(ToolError);

        const listed = registry.serverFor({ listing: [] });
        expect(listed).toBeDefined();
    });
});
