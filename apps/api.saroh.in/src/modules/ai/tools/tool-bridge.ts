import { HttpException, Inject, Injectable, Optional } from "@nestjs/common";
import { z } from "zod";

import type { OrganizationContext } from "../../../common/types/organization-context";
import type { McpTool } from "../../mcp/tool-registry";
import { McpToolRegistry, toolError } from "../../mcp/tool-registry";
import { OrganizationContextService } from "../../organizations/organization-context.service";
import type { AgentDefinition } from "../agents/agent-definition";
import { DraftsService } from "../drafts/drafts.service";
import type { AiToolCall, AiToolDefinition } from "../providers/provider.port";
import { AI_AGENTS } from "../turn/turn-runner";
import { askAiCall, refused, textOf } from "./ask-ai-call";
import type { AiToolbox, AiToolRun, AiTurnRef } from "./toolbox.port";

/**
 * Ask AI's tools (plan 2026-11-13-001, U4): the MCP tools, run in-process
 * through {@link McpToolRegistry} as the person asking, with an `app`
 * connection that covers only the business they have open.
 *
 * - The list is the agents' own, in their order: read tools, and the
 *   write tools an agent drafts with (U5), which never save: they make a
 *   draft for the person to confirm ({@link DraftsService}). A module
 *   that is off, or a role without the action, is the tool's own readable
 *   refusal, never a shorter list.
 * - No `business` argument: the definitions don't offer it and a call's is
 *   dropped, so a model can't reach another of the person's businesses.
 * - The person's role is read again on every call (a downgrade counts at
 *   once), minus {@link NEVER_FOR_AI}.
 * - Input is checked against the tool's contract before it runs.
 * - The model gets the tool's text, never JSON; what customers or the
 *   website wrote is already quoted as untrusted by the tool.
 */
@Injectable()
export class ToolBridge implements AiToolbox {
    private readonly allowed: ReadonlySet<string>;
    private readonly drafting: ReadonlySet<string>;
    private readonly schemas = new Map<string, Record<string, unknown>>();

    constructor(
        private readonly registry: McpToolRegistry,
        private readonly organizations: OrganizationContextService,
        @Inject(AI_AGENTS) agents: readonly AgentDefinition[],
        @Optional() private readonly drafts?: DraftsService,
    ) {
        this.allowed = new Set(agents.flatMap((a) => a.tools));
        this.drafting = new Set(agents.flatMap((a) => a.draftTools));
    }

    definitions(names: readonly string[]): AiToolDefinition[] {
        return names.flatMap((name) => {
            const tool = this.usable(name);
            if (!tool) return [];
            let inputSchema = this.schemas.get(name);
            if (!inputSchema) {
                inputSchema = z.toJSONSchema(tool.contract.input, {
                    io: "input",
                });
                this.schemas.set(name, inputSchema);
            }
            return [{ name, description: tool.description, inputSchema }];
        });
    }

    async run(
        ctx: OrganizationContext,
        call: AiToolCall,
        signal: AbortSignal,
        turn?: AiTurnRef,
    ): Promise<AiToolRun> {
        if (signal.aborted) return refused("Stopped before this ran.");
        const tool = this.usable(call.name);
        if (!tool) {
            return refused(
                this.registry.get(call.name) && this.allowed.has(call.name)
                    ? "Ask AI can't make changes yet. Next: tell the person they can do it in the Saroh app."
                    : `There is no tool ${JSON.stringify(call.name.slice(0, 64))}. Next: use one of the tools you were given.`,
            );
        }
        let live: OrganizationContext | null;
        try {
            live = await this.live(ctx);
        } catch (error) {
            return textOf(toolError(error, tool.name));
        }
        if (!live) {
            return refused(
                "This person is no longer part of this business, so nothing can be read. Next: tell them.",
            );
        }
        const asker = askAiCall(live);
        if (!tool.hints.readOnlyHint) {
            // A draft tool: validated, kept as a draft, never saved here.
            if (!this.drafts || !turn) {
                return refused(
                    "Ask AI can't make changes here. Next: tell the person they can do it in the Saroh app.",
                );
            }
            return this.drafts.draft(asker, tool, call.input, turn);
        }
        return textOf(
            await this.registry.callInProcess(tool, call.input, asker),
        );
    }

    /**
     * A tool an agent lists that only reads, or that it drafts with;
     * `wide` ones are about other businesses.
     */
    private usable(name: string): McpTool | undefined {
        const tool = this.registry.get(name);
        return tool &&
            this.allowed.has(name) &&
            (tool.hints.readOnlyHint || this.drafting.has(name)) &&
            !tool.wide
            ? tool
            : undefined;
    }

    /** The person's live context in the business they have open, or null once they left it. */
    private async live(
        ctx: OrganizationContext,
    ): Promise<OrganizationContext | null> {
        try {
            return await this.organizations.resolve(
                ctx.userId,
                ctx.organizationId,
            );
        } catch (error) {
            if (error instanceof HttpException) return null;
            throw error;
        }
    }
}
