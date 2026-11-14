import type { Prisma } from "@prisma/client";

import type { Db } from "./helpers";
import { id } from "./helpers";

/**
 * Ask AI on the seeded stack (DEC-220; `e2e/tests/ask-ai.spec.ts`, where
 * the API answers from a script, `AI_PROVIDER_FAKE`).
 *
 * - The `ASK_AI` rollout flag, off by default as in production, on for
 *   Northwind (which asks; its plan's Ask AI row is the sample
 *   catalogue's) and for Asha's Candles on the enforced entry plan
 *   (`email-prompt.ts`), where Ask AI is locked on the plan.
 * - The AI settings a turn reads. Made-up test values, never Saroh's: every
 *   price 1 and every cap far above what a test spends. Written only for a
 *   key with no row at all, and in effect from 2020, so a value the team set
 *   (the newest in effect wins) is never shadowed. Saroh-wide rows, like the
 *   flag rows, so the reset leaves them.
 */

/** Asha's Candles on the entry plan, plan limits enforced (`email-prompt.ts`). */
export const ASK_AI_LOCKED_ORG = id("org", "email-prompt", "free");

const OLD = new Date("2020-01-01T00:00:00.000Z");
const REASON = "Seed: made-up test values for the browser tests, not Saroh's.";
const ONE = {
    input: 1,
    output: 1,
    cacheRead: 1,
    cacheWrite5m: 1,
    cacheWrite1h: 1,
};

/** Each within its schema's bounds (`ai-setting-keys.ts` in the API). */
export const ASK_AI_TEST_SETTINGS: Record<string, Prisma.InputJsonValue> = {
    "askAi.questions.model": "claude-haiku-5-5",
    "askAi.questions.effort": "low",
    "askAi.drafts.model": "claude-haiku-5-5",
    "askAi.drafts.effort": "low",
    "askAi.maxOutputTokens": 4_000,
    "askAi.maxRounds": 5,
    "askAi.maxPromptTokens": 1_000_000,
    "askAi.maxToolResultChars": 100_000,
    "askAi.maxHistoryTokens": 100_000,
    "askAi.turnTokenCap": 10_000_000,
    "askAi.redraftsPerConversation": 100,
    "askAi.stuckTurnMinutes": 60,
    "askAi.runningTurnsPerBusiness": 100,
    "askAi.questionsPerMinutePerPerson": 100,
    "askAi.turnCostCapMicroUsd": 1_000_000_000,
    // A start is refused once the day's spend plus one turn's cap passes the
    // day's cap, so the day caps sit far above the turn cap (the most allowed).
    "askAi.businessDayCostCapMicroUsd": 1_000_000_000_000,
    "ai.sarohDayCostCapMicroUsd": 1_000_000_000_000,
    "ai.prices": {
        "claude-haiku-5-5": ONE,
        "claude-sonnet-5-5": ONE,
        "claude-opus-5-5": ONE,
    },
};

export async function seedAskAi(
    prisma: Db,
    northwindId: string,
    setByUserId: string,
): Promise<void> {
    await prisma.featureFlag.upsert({
        where: { key: "ASK_AI" },
        update: {},
        create: {
            id: "flag_ASK_AI",
            key: "ASK_AI",
            description:
                "Ask AI for a business (DEC-220). Off by default; on for Northwind and one entry-plan business in the seed.",
            enabledByDefault: false,
        },
    });
    const orgs = [northwindId, ASK_AI_LOCKED_ORG];
    for (let n = 0; n < orgs.length; n++) {
        const organizationId = orgs[n];
        await prisma.featureFlagOverride.upsert({
            where: {
                flagKey_organizationId: { flagKey: "ASK_AI", organizationId },
            },
            update: { enabled: true },
            create: {
                id: id("flagoverride", "ask-ai", n),
                flagKey: "ASK_AI",
                organizationId,
                enabled: true,
            },
        });
    }
    // Written once each (a trigger refuses an update): only where none is.
    for (const [key, value] of Object.entries(ASK_AI_TEST_SETTINGS)) {
        if (await prisma.aiSetting.findFirst({ where: { key } })) continue;
        await prisma.aiSetting.create({
            data: {
                key,
                value,
                reason: REASON,
                setByUserId,
                effectiveFrom: OLD,
                createdAt: OLD,
            },
        });
    }
}
