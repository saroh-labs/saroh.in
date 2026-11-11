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

import type { ModuleKey } from "../capabilities/module-keys";
import { CapsService } from "../rate-limits/caps";
import { LimitsService } from "../rate-limits/limits.service";
import type { McpRequest } from "./mcp-auth.guard";
import { McpAuthGuard } from "./mcp-auth.guard";
import type { McpCall, McpLimit } from "./tool-registry";
import { McpToolRegistry } from "./tool-registry";

const PROTOCOL_VERSION_KEY = "io.modelcontextprotocol/protocolVersion";

/** What the controller hands the per-request server factory. */
interface McpExtra {
    call: McpCall;
    listAll: boolean;
    limited: McpLimit | null;
    modulesOff?: ReadonlySet<ModuleKey>;
}

/**
 * `/mcp` (plan 2026-11-10-001, U10): Saroh's MCP server, stateless, in
 * process. `McpAuthGuard` answers 404 off `mcp.<edition>` or with `API_MCP`
 * off, 401 without a good token or AI key, and puts the business's context
 * and the connection on the request. Each request then gets a fresh server
 * holding the tools that context may use (`McpToolRegistry`).
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
            const extra = authInfo?.extra as unknown as McpExtra;
            return this.registry.serverFor(extra.call, extra);
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
    ) {}

    @All()
    async serve(@Req() req: McpRequest, @Res() res: Response): Promise<void> {
        const ctx = req.organizationContext;
        const connection = req.mcpConnection;
        // McpAuthGuard sets both or refuses; never reached without them.
        if (!ctx || !connection) throw new HttpException("", 401);
        const body: unknown = req.body;
        const isToolCall = methodOf(body) === "tools/call";

        const limited = await this.limit(
            res,
            ctx.organizationId,
            connection.id,
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

        const extra: McpExtra = {
            call: { ctx, connection },
            listAll: isToolCall,
            limited,
            // Only a listing hides by module; a call checks its own tool's.
            ...(methodOf(body) === "tools/list"
                ? { modulesOff: await this.registry.modulesOff(ctx) }
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
     * One call off the connection's and the business's MCP cap (U4's
     * durable window). Null when allowed, else how long to wait.
     */
    private async limit(
        res: Response,
        organizationId: string,
        connectionId: string,
    ): Promise<McpLimit | null> {
        const cap = await this.caps.rpm(organizationId, "mcp");
        const now = Date.now();
        for (const id of [`conn:${connectionId}`, `org:${organizationId}`]) {
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
