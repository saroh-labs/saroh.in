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
    ): Promise<AiToolRun>;
}

export const AI_TOOLBOX = Symbol("AI_TOOLBOX");

/** Until U4: no tools, so a turn is answer-only. */
export const NO_TOOLS: AiToolbox = {
    definitions: () => [],
    run: () =>
        Promise.resolve({ output: "That tool isn't there.", isError: true }),
};
