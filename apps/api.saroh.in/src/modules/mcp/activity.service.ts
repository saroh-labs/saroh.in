import { Injectable, Logger } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import {
    AuditAction,
    AuditOutcome,
    AuditService,
} from "../audit/audit.service";
import type { McpConnection } from "./mcp-auth.guard";

/** Who is calling a tool: the connection, and the business the call works in. */
export interface McpCall {
    /** The business this call works in, with the person's live role there. */
    ctx: OrganizationContext;
    connection: McpConnection;
    /**
     * False only for a `wide` tool called without `business` on a
     * connection with several: `ctx` is then just the first of {@link reach}.
     */
    named?: boolean;
    /** For a `wide` tool: every business the connection reaches now. */
    reach?: OrganizationContext[];
}

/** What one write tool did, for the business's activity list. */
export interface ActivityEntry {
    tool: string;
    /** The record it touched: `site:<id>`, `product:<id>`, … ({@link siteTarget}). */
    target?: string;
    /** One sentence a person reads. Saroh's words, never customer text. */
    summary: string;
}

/** The audit target an AI write is filed under, per connection kind. */
const TARGET_TYPE: Record<McpConnection["kind"], string> = {
    oauth: "ai_connection",
    key: "api_key",
    app: "ai_agent",
};

/** A site write's activity target; a restore point's session reads it. */
export const siteTarget = (siteId: string) => `site:${siteId}`;

/**
 * Every MCP write (plan 2026-11-10-001, U10): one `McpActivity` row, with
 * the connection it came through, and one audit event. Called by the tool
 * framework after a write tool succeeds. A failure here never fails the
 * tool call: the change already happened, and saying it didn't would make
 * the app try again.
 *
 * Degraded path: `mcp_activity_failed` (WARN) — the change went through
 * but isn't in the business's AI activity list. A steady stream means the
 * table or its RLS is broken.
 */
@Injectable()
export class McpActivityService {
    private readonly logger = new Logger(McpActivityService.name);

    constructor(private readonly audit: AuditService) {}

    async record({ ctx, connection }: McpCall, entry: ActivityEntry) {
        try {
            await prisma.mcpActivity.create({
                data: {
                    organizationId: ctx.organizationId,
                    userId: connection.kind === "key" ? null : ctx.userId,
                    apiKeyId: connection.kind === "key" ? connection.id : null,
                    connectionId: connection.id,
                    clientName: connection.clientName ?? "AI app",
                    tool: entry.tool,
                    target: entry.target ?? null,
                    summary: entry.summary.slice(0, 500),
                },
            });
        } catch (error) {
            this.logger.warn(
                `mcp_activity_failed tool=${entry.tool}: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
        await this.audit.record({
            action: AuditAction.AiToolWrite,
            actorUserId: ctx.userId,
            actorRoleKey: ctx.roleKey,
            organizationId: ctx.organizationId,
            targetType: TARGET_TYPE[connection.kind],
            // An agent is named by its key; a connection by its grant or key.
            targetId:
                connection.kind === "app" ? connection.agent : connection.id,
            outcome: AuditOutcome.Success,
            metadata: {
                tool: entry.tool,
                connection: connection.kind,
                app: connection.clientName,
                target: entry.target ?? null,
            },
        });
    }
}
