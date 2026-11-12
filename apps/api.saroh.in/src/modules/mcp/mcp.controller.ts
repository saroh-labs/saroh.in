import { toNodeHandler } from "@modelcontextprotocol/node";
import type { AuthInfo } from "@modelcontextprotocol/server";
import { createMcpHandler } from "@modelcontextprotocol/server";
import {
    All,
    Controller,
    HttpException,
    HttpStatus,
    Logger,
    Req,
    Res,
    UseGuards,
} from "@nestjs/common";
import type { Response } from "express";

import { CapsService } from "../rate-limits/caps";
import { LimitsService } from "../rate-limits/limits.service";
import type { McpRequest } from "./mcp-auth.guard";
import { McpAuthGuard } from "./mcp-auth.guard";
import type { ContextIn, McpLimit, McpServe } from "./tool-registry";
import { McpToolRegistry } from "./tool-registry";

const PROTOCOL_VERSION_KEY = "io.modelcontextprotocol/protocolVersion";

/**
 * `/mcp` (plan 2026-11-10-001, U10): Saroh's MCP server, stateless, in
 * process. `McpAuthGuard` answers 404 off `mcp.<edition>` or with `API_MCP`
 * off, 401 without a good token or AI key, and puts the connection (and the
 * businesses it reaches) on the request. A `tools/call` is then worked out
 * for the business it names (`McpToolRegistry.target`), and a `tools/list`
 * shows the tools usable in any of them. Each request gets a fresh server.
 *
 * Every method reaches the SDK (`@All`): it answers GET and DELETE with 405
 * itself, which clients read as "POST only". 2026-07-28 traffic is served
 * as such; 2025-era traffic (`initialize`, 2025-11-25 and older) through the
 * SDK's stateless legacy path, which answers as SSE.
 */
@Controller("mcp")
@UseGuards(McpAuthGuard)
export class McpController {
    private readonly logger = new Logger("Mcp");

    private readonly handler = createMcpHandler(
        ({ authInfo }) => {
            const serve = authInfo?.extra as unknown as McpServe;
            return this.registry.serverFor(serve);
        },
        {
            onerror: (error) =>
                this.logger.warn(`mcp_transport_error: ${error.message}`),
        },
    );

    private readonly node = toNodeHandler({
        fetch: (request, options) =>
            this.handler.fetch(
                withBodyVersion(request, options?.parsedBody),
                options,
            ),
    });

    constructor(
        private readonly registry: McpToolRegistry,
        private readonly caps: CapsService,
        private readonly limits: LimitsService,
        private readonly guard: McpAuthGuard,
    ) {}

    @All()
    async serve(@Req() req: McpRequest, @Res() res: Response): Promise<void> {
        const connection = req.mcpConnection;
        // McpAuthGuard sets it or refuses; never reached without it.
        if (!connection) throw new HttpException("", 401);
        const body: unknown = req.body;
        const method = methodOf(body);
        const isToolCall = method === "tools/call";
        const contextIn: ContextIn = (organizationId) =>
            this.guard.contextIn(connection, organizationId, req.headers.host);

        const params = (body as { params?: Record<string, unknown> } | null)
            ?.params;
        const target = isToolCall
            ? await this.registry.target(
                  connection,
                  this.registry.get(String(params?.name)),
                  (params?.arguments as Record<string, unknown> | undefined)
                      ?.business,
                  contextIn,
              )
            : undefined;
        const business =
            target && !(target instanceof Error) && target.named !== false
                ? target.ctx.organizationId
                : undefined;

        const limited = await this.limit(
            res,
            business ?? connection.businesses[0],
            connection.id,
            business,
        );
        // A tool call over the limit gets a tool error the model can act on;
        // anything else, the plain 429.
        if (limited && !isToolCall) {
            res.setHeader("Retry-After", String(limited.retryAfterSeconds));
            throw new HttpException(
                {
                    error: {
                        code: "rate_limited",
                        message: `Too many requests. Try again in ${limited.retryAfterSeconds} seconds.`,
                    },
                },
                HttpStatus.TOO_MANY_REQUESTS,
            );
        }

        const extra: McpServe = {
            target,
            limited,
            // Only a listing hides tools; a call checks its own.
            ...(method === "tools/list"
                ? { listing: await this.registry.reach(connection, contextIn) }
                : {}),
        };
        (req as McpRequest & { auth?: AuthInfo }).auth = {
            token: "",
            clientId:
                connection.kind === "oauth"
                    ? connection.clientId
                    : connection.id,
            scopes: connection.kind === "oauth" ? connection.scopes : [],
            extra: extra as unknown as Record<string, unknown>,
        };
        await this.node(req, res, body);
    }

    /**
     * One call off the connection's MCP cap and, for a call in a business,
     * that business's (U4's durable window); the cap is `capOf`'s. Null when
     * allowed, else how long to wait.
     */
    private async limit(
        res: Response,
        capOf: string,
        connectionId: string,
        business: string | undefined,
    ): Promise<McpLimit | null> {
        const cap = await this.caps.rpm(capOf, "mcp");
        const now = Date.now();
        const ids = [`conn:${connectionId}`];
        if (business) ids.push(`org:${business}`);
        for (const id of ids) {
            const decision = await this.limits.take("mcp", id, cap, now);
            const wait = Math.max(
                1,
                Math.ceil((decision.resetAt - now) / 1000),
            );
            res.setHeader("RateLimit-Limit", String(cap));
            res.setHeader("RateLimit-Remaining", String(decision.remaining));
            res.setHeader("RateLimit-Reset", String(wait));
            if (!decision.allowed) return { retryAfterSeconds: wait };
        }
        return null;
    }
}

/** The JSON-RPC method of a single message; undefined for a batch or none. */
function methodOf(body: unknown): string | undefined {
    const m = (body as { method?: unknown } | null)?.method;
    return typeof m === "string" ? m : undefined;
}

/**
 * shortcut: some Claude Desktop and Claude Code builds send the
 * `MCP-Protocol-Version` header 2025-11-25 with a 2026-07-28 body, which the
 * SDK refuses (-32020); the body's version is copied into the header. Drop
 * it once no client in use sends the mismatch.
 */
export function withBodyVersion(request: Request, body: unknown): Request {
    const msg = body as {
        method?: string;
        params?: Record<string, unknown>;
    } | null;
    const meta = msg?.params?._meta as Record<string, unknown> | undefined;
    const named =
        meta?.[PROTOCOL_VERSION_KEY] ??
        (msg?.method === "initialize"
            ? msg.params?.protocolVersion
            : undefined);
    const sent = request.headers.get("mcp-protocol-version");
    if (typeof named !== "string" || !sent || named === sent) return request;
    const headers = new Headers(request.headers);
    headers.set("mcp-protocol-version", named);
    return new Request(request, { headers });
}
