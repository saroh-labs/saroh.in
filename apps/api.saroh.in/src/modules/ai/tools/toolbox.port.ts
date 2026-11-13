import type { OrganizationContext } from "../../../common/types/organization-context";
import type { AiToolCall, AiToolDefinition } from "../providers/provider.port";

/**
 * What the turn runner needs from the tools (U4 wires the bridge): their
 * definitions, and running one as the person asking. A refusal (module
 * off, not allowed) is a readable `output` with `isError`, never a throw.
 */
export interface AiToolRun {
    /** Text for the model, never JSON (spec §2.3). */
    output: string;
    isError?: boolean;
    /** A draft tool's card to confirm (U5). */
    card?: { kind: string; data: Record<string, unknown> };
}

export interface AiToolbox {
    /** The definitions for `names`, in that order; a name it lacks is left out. */
    definitions(names: readonly string[]): AiToolDefinition[];
    run(
        ctx: OrganizationContext,
        call: AiToolCall,
        signal: AbortSignal,
        /** The turn it runs in: a draft is kept against it (U5). */
        turn?: AiTurnRef,
    ): Promise<AiToolRun>;
}

/** Where a tool call was made: the conversation and the turn. */
export interface AiTurnRef {
    conversationId: string;
    turnId: string;
}

export const AI_TOOLBOX = Symbol("AI_TOOLBOX");

/** No tools: an answer-only turn (specs; the module binds the bridge). */
export const NO_TOOLS: AiToolbox = {
    definitions: () => [],
    run: () =>
        Promise.resolve({ output: "That tool isn't there.", isError: true }),
};
