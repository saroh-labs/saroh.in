import { createHash } from "node:crypto";

import type { AiLanguage } from "@saroh/database";

import type { OrganizationContext } from "../../../common/types/organization-context";
import type { AiSettingKey } from "../settings/ai-setting-keys";

/**
 * What an agent is (DEC-220, spec §2.2): its job, the house rules every
 * agent shares, the facts about the business it is told, which model and
 * effort each kind of work runs on (AI setting keys, never values), and its
 * tools in a fixed order. Ask AI is the first; the next agent is another
 * definition, not another loop.
 */

/** The words shown while a tool runs, in each language a person may pick. */
export interface StatusWords {
    en: string;
    hinglish: string;
    /** Devanagari. */
    hi: string;
}

/** The setting keys that hold one kind of work's model and effort. */
export interface ModelKeys {
    model: Extract<AiSettingKey, `${string}.model`>;
    effort: Extract<AiSettingKey, `${string}.effort`>;
}

export interface AgentDefinition<Tool extends string = string> {
    /** Stored on conversations and usage rows ("ask-ai"). */
    key: string;
    /** The agent's own job, after the house rules. */
    job: string;
    /** The house rules, shared by every agent. */
    houseRules: string;
    /** The facts about the business, read per turn; never customer data. */
    businessBlock(
        ctx: OrganizationContext,
        language: AiLanguage,
        now: Date,
    ): Promise<string>;
    /** Answering questions, and making drafts (U5). */
    models: { questions: ModelKeys; drafts: ModelKeys };
    /** Every tool it may ask for, in the order sent (a stable cache prefix). */
    tools: readonly Tool[];
    /** The tools whose call ends the turn with a card to confirm (U5). */
    draftTools: readonly Tool[];
    /** Fixed words per tool, so a status line never comes from the model. */
    statusWords: Readonly<Record<Tool, StatusWords>>;
    /** The metered key a counted turn draws on (U7). */
    usageKey: "questions";
}

/** Shown for a tool that has no words of its own. */
export const ANY_TOOL_WORDS: StatusWords = {
    en: "Looking that up…",
    hinglish: "Dekh rahe hain…",
    hi: "देख रहे हैं…",
};

export function statusWordsFor(
    agent: AgentDefinition,
    tool: string,
    language: AiLanguage,
): string {
    const words =
        (agent.statusWords as Record<string, StatusWords | undefined>)[tool] ??
        ANY_TOOL_WORDS;
    if (language === "HINDI") return words.hi;
    if (language === "HINGLISH") return words.hinglish;
    return words.en;
}

/** The instructions before the cache breakpoint: the same for every business. */
export const sharedInstructions = (agent: AgentDefinition) =>
    `${agent.houseRules}\n\n${agent.job}`;

/**
 * A short, stable hash of what the model is told and may do, stamped on
 * conversations and usage rows so a change in answers can be traced to a
 * change in the agent.
 */
export function agentVersion(agent: AgentDefinition): string {
    const statusWords = Object.fromEntries(
        Object.entries(agent.statusWords).sort(([a], [b]) =>
            a.localeCompare(b),
        ),
    );
    return createHash("sha256")
        .update(
            JSON.stringify([
                agent.houseRules,
                agent.job,
                agent.tools,
                agent.draftTools,
                statusWords,
            ]),
        )
        .digest("hex")
        .slice(0, 16);
}
