import type { OrganizationContext } from "../../../common/types/organization-context";
import { NEVER_FOR_AI } from "../../mcp/ai-apps";
import type { McpCall } from "../../mcp/tool-registry";
import type { AiToolRun } from "./toolbox.port";

// shortcut: one agent today, so every call is Ask AI's; pass the agent through when a second one lands.
const AGENT = { key: "ask-ai", name: "Ask AI" };

/**
 * An Ask AI tool call as the person (plan 2026-11-13-001 U4/U5): an `app`
 * connection covering only the business they have open, with their live
 * role there less {@link NEVER_FOR_AI}. `ctx` must be live: read this
 * request (the guard's) or again before each call (the bridge's).
 */
export function askAiCall(ctx: OrganizationContext): McpCall {
    const actions = new Set(
        [...(ctx.actions ?? [])].filter((a) => !NEVER_FOR_AI.has(a)),
    );
    return {
        ctx: { ...ctx, actions },
        connection: {
            kind: "app",
            id: `${AGENT.key}:${ctx.userId}`,
            agent: AGENT.key,
            clientName: AGENT.name,
            userId: ctx.userId,
            businesses: [ctx.organizationId],
        },
        named: true,
    };
}

export const refused = (output: string): AiToolRun => ({
    output,
    isError: true,
});

/** A registry result as text for the model: its text parts, images left out. */
export function textOf(result: {
    content: { type: string; text?: string }[];
    isError?: boolean;
}): AiToolRun {
    const output = result.content
        .flatMap((c) => (c.type === "text" && c.text ? [c.text] : []))
        .join("\n");
    return result.isError ? refused(output) : { output };
}
