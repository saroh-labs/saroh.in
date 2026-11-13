/**
 * Who may ask Ask AI, and how much, against a real Postgres (DEC-220, plan
 * 2026-11-13-001 U7): the plan (Free locked, the allowance a catalogue
 * cell counted over the billing period, raised by Request more's add-on),
 * `ai:use`, the business's switch, the halt over a per-business `ASK_AI`
 * override, and the start's money guards (the business's day, reserved
 * per running turn; one running turn a person).
 *
 * Runs in the integration project (TEST_DATABASE_URL). The catalogue is
 * `fakeAskAiCatalog` (3 questions a month on `grow`, 5 on `pro`, 2 a pack):
 * made-up numbers, never Saroh's. Cost settings are this business's
 * overrides, in test units.
 */
import { randomBytes, randomUUID } from "node:crypto";

import { ConflictException, ForbiddenException } from "@nestjs/common";
import { prisma, writeCatalogueVersion } from "@saroh/database";
import { planRows } from "@saroh/pricing-catalog";

import { fakeAskAiCatalog } from "../../../../test/fixtures/pricing-catalog";
import type { OrganizationContext } from "../../../common/types/organization-context";
import { env } from "../../../env";
import { AddonsService } from "../../billing/addons.service";
import { CatalogueAccessService } from "../../billing/catalogue-access.service";
import { countUsage, meterWindow } from "../../billing/metering";
import { FeatureFlagService } from "../../feature-flags/feature-flags.service";
import { FlagKey } from "../../feature-flags/flags";
import { OrganizationContextService } from "../../organizations/organization-context.service";
import { ASK_AI_AGENT } from "../agents/ask-ai.agent";
import { ConversationsService } from "../conversations.service";
import { FakeAiProvider } from "../providers/fake.provider";
import { AiRequestsService } from "../requests/ai-requests.service";
import { AiSettingsService } from "../settings/ai-settings.service";
import { NO_TOOLS } from "../tools/toolbox.port";
import type { TurnEvent } from "../turn/events";
import { TurnRunner } from "../turn/turn-runner";
import type { TurnConversation } from "../turn/turn-store";
import { TurnStore } from "../turn/turn-store";
import type { AskAiRefusal } from "./ask-ai-access";
import { AskAiAccess } from "./ask-ai-access";

const mutableEnv = env as { AI_TEXT_ENC_KEY?: string };
const keyBefore = mutableEnv.AI_TEXT_ENC_KEY;

const V = 840_000 + Math.floor(Math.random() * 9_000);
const DAY = 86_400_000;
/** A turn's most, in test units; the day caps below are multiples of it. */
const CAP = 1_000;
const ZONE = "Asia/Kolkata";

const settings = new AiSettingsService();
const flags = new FeatureFlagService();
const conversations = new ConversationsService();
const store = new TurnStore(conversations);
const access = new AskAiAccess(
    settings,
    flags,
    store,
    new CatalogueAccessService(flags),
);
const requests = new AiRequestsService(access, new AddonsService());
const organizations = new OrganizationContextService();
const actor = { userId: "user_test_settings" };

let seq = 0;
const uniq = (label: string) => `${label}-${process.pid}-${++seq}`;

type PlanId = "free" | "grow" | "pro";

async function planRow(planId: PlanId) {
    return prisma.plan.findUniqueOrThrow({
        where: {
            key_version_interval: {
                key: `catalog.${planId}`,
                version: V,
                interval: "month",
            },
        },
    });
}

/** A paid plan billed through the provider, its period ending in ten days. */
async function subscribe(org: string, planId: PlanId) {
    const plan = await planRow(planId);
    const paid = planId !== "free";
    await prisma.subscription.upsert({
        where: { organizationId: org },
        create: {
            organizationId: org,
            planId: plan.id,
            status: "ACTIVE",
            ...(paid
                ? {
                      provider: "RAZORPAY",
                      providerSubscriptionId: uniq("sub"),
                      currentPeriodEnd: new Date(Date.now() + 10 * DAY),
                  }
                : {}),
        },
        update: { planId: plan.id },
    });
}

async function person(org: string, role: string, name = role) {
    const user = await prisma.user.create({
        data: { email: `${uniq(role.toLowerCase())}@example.com`, name },
    });
    await prisma.membership.create({
        data: { organizationId: org, userId: user.id, role },
    });
    return user.id;
}

/** A business on `planId` (none: no subscription), Ask AI rolled out to it. */
async function business(planId: PlanId | null = "grow") {
    const org = await prisma.organization.create({
        data: { name: "Rye Bakery", slug: uniq("rye"), currency: "INR" },
    });
    const ownerId = await person(org.id, "OWNER", "Meera");
    await prisma.businessProfile.create({
        data: { organizationId: org.id, timezone: ZONE },
    });
    if (planId) await subscribe(org.id, planId);
    await prisma.featureFlagOverride.create({
        data: {
            flagKey: FlagKey.ASK_AI,
            organizationId: org.id,
            enabled: true,
        },
    });
    const values: Record<string, unknown> = {
        "askAi.questions.model": "claude-haiku-5-5",
        "askAi.questions.effort": "low",
        "askAi.maxOutputTokens": 500,
        "askAi.maxRounds": 4,
        "askAi.maxPromptTokens": 1_000_000,
        "askAi.maxToolResultChars": 100_000,
        "askAi.maxHistoryTokens": 1_000_000,
        "askAi.turnTokenCap": 1_000_000,
        "askAi.turnCostCapMicroUsd": CAP,
        "askAi.businessDayCostCapMicroUsd": 100 * CAP,
        "askAi.runningTurnsPerBusiness": 5,
        "askAi.questionsPerMinutePerPerson": 100,
        "ai.prices": {
            "claude-haiku-5-5": {
                input: 1_000_000,
                output: 1_000_000,
                cacheRead: 1_000_000,
                cacheWrite5m: 1_000_000,
                cacheWrite1h: 1_000_000,
            },
        },
    };
    for (const [key, value] of Object.entries(values)) {
        await setFor(org.id, key, value);
    }
    return { id: org.id, ownerId };
}

function setFor(org: string, key: string, value: unknown) {
    return settings.setOverride(org, key, value, "access spec", actor, {
        effectiveFrom: new Date(Date.now() - 1000),
    });
}

const asIn = (org: string, userId: string) =>
    organizations.resolve(userId, org);

/** A usage row as a finished (or running) turn leaves it. */
async function usage(
    ctx: OrganizationContext,
    over: {
        counted?: boolean;
        outcome?: "ANSWERED" | "STOPPED_BEFORE" | "FAILED" | "RUNNING";
        costMicroUsd?: number;
        startedAt?: Date;
    } = {},
) {
    const startedAt = over.startedAt ?? new Date(Date.now() - 60 * 60_000);
    const window = await meterWindow(prisma, ctx.organizationId, startedAt);
    await prisma.aiUsage.create({
        data: {
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            turnId: randomUUID(),
            agent: "ask-ai",
            agentVersion: "v",
            model: "claude-haiku-5-5",
            effort: "low",
            windowStart: window.start,
            windowKey: window.key,
            startedAt,
            outcome: over.outcome ?? "ANSWERED",
            counted: over.counted ?? true,
            costMicroUsd: over.costMicroUsd ?? 0,
        },
    });
}

/** One question through the runner, answered "Teen." by the fake provider. */
async function ask(ctx: OrganizationContext) {
    const provider = new FakeAiProvider([
        [
            { type: "text-delta", text: "Teen." },
            {
                type: "finish",
                reason: "stop",
                usage: {
                    inputTokens: 10,
                    outputTokens: 2,
                    cacheReadTokens: 0,
                    cacheWriteTokens: 0,
                    thinkingTokens: 0,
                },
            },
        ],
    ]);
    const runner = new TurnRunner(
        provider,
        NO_TOOLS,
        [ASK_AI_AGENT],
        settings,
        flags,
        store,
        access,
    );
    const conversation = await runner.openConversation(ctx, "ask-ai");
    const events: TurnEvent[] = [];
    for await (const e of runner.run({
        ctx,
        conversationId: conversation.id,
        question: "Kal kitni bookings hain?",
        turnId: randomUUID(),
        signal: new AbortController().signal,
    })) {
        events.push(e);
    }
    return { events, sent: provider.requests.length };
}

const refusalOf = (events: TurnEvent[]): AskAiRefusal | undefined =>
    events.find((e) => e.type === "refused")?.refusal;
const doneOf = (events: TurnEvent[]) => events[events.length - 1];

/** A turn start's checks and RUNNING row at `now`, as the runner makes them. */
async function start(ctx: OrganizationContext, now: Date) {
    const entry = await access.entry(ctx, now);
    if (!entry.ok) throw new Error(`not entered: ${entry.refusal.reason}`);
    const conversation: TurnConversation = await store.createConversation(ctx, {
        agent: "ask-ai",
        agentVersion: "v",
        model: "claude-haiku-5-5",
        effort: "low",
    });
    return store.start(
        ctx,
        conversation,
        randomUUID(),
        "Kal?",
        now,
        access.admit(
            ctx,
            entry.row,
            await access.limits(ctx.organizationId),
            now,
        ),
    );
}

beforeAll(async () => {
    // A throwaway key for this run only, never a value in the repo.
    mutableEnv.AI_TEXT_ENC_KEY = randomBytes(32).toString("base64");
    const catalog = fakeAskAiCatalog();
    const rows = planRows(catalog, V);
    const { planIds } = await writeCatalogueVersion(prisma, {
        version: V,
        catalog,
        goLiveAt: new Date(Date.now() - DAY),
        policy: "keep",
        planRows: rows,
    });
    await prisma.pricingProviderPlan.createMany({
        data: planIds
            .filter((_, i) => rows[i]!.priceCents > 0)
            .map((planId) => ({
                planId,
                provider: "RAZORPAY",
                status: "SYNCED",
                providerPlanId: `plan_${planId}`,
            })),
    });
    await prisma.featureFlag.upsert({
        where: { key: FlagKey.ASK_AI },
        create: { key: FlagKey.ASK_AI, enabledByDefault: false },
        update: {},
    });
    // Saroh-wide only; far above anything these turns spend.
    await settings.set(
        "ai.sarohDayCostCapMicroUsd",
        1_000_000 * CAP,
        "access spec",
        actor,
        new Date(Date.now() - 1000),
    );
});
afterAll(() => {
    mutableEnv.AI_TEXT_ENC_KEY = keyBefore;
});

describe("the plan", () => {
    it("Free is refused before any provider call", async () => {
        const b = await business("free");
        const { events, sent } = await ask(await asIn(b.id, b.ownerId));
        expect(refusalOf(events)).toEqual({
            reason: "locked",
            upgradeTo: "Plan B",
        });
        expect(doneOf(events)).toMatchObject({ counted: false });
        expect(sent).toBe(0);
        expect(
            await prisma.aiUsage.count({ where: { organizationId: b.id } }),
        ).toBe(0);
    });

    it("a business the catalogue doesn't reach is locked (no subscription)", async () => {
        const b = await business(null);
        const entry = await access.entry(await asIn(b.id, b.ownerId));
        expect(entry).toMatchObject({
            ok: false,
            refusal: { reason: "locked" },
        });
    });

    it("moving down to Free refuses at once; moving up applies the new allowance at once", async () => {
        const b = await business("grow");
        const ctx = await asIn(b.id, b.ownerId);
        for (let i = 0; i < 3; i++) await usage(ctx);
        expect(refusalOf((await ask(ctx)).events)).toMatchObject({
            reason: "allowance",
            limit: 3,
        });
        await subscribe(b.id, "pro");
        expect(doneOf((await ask(ctx)).events)).toMatchObject({
            outcome: "ANSWERED",
            counted: true,
        });
        await subscribe(b.id, "free");
        expect(refusalOf((await ask(ctx)).events)).toMatchObject({
            reason: "locked",
        });
        // History stays readable.
        expect((await conversations.list(ctx)).length).toBeGreaterThan(0);
    });

    it("a waitlist business on a Grow plan override gets Grow's allowance", async () => {
        const b = await business(null);
        await prisma.entitlementOverride.create({
            data: {
                organizationId: b.id,
                kind: "plan",
                key: "plan",
                planKey: "grow",
                reason: "waitlist",
                grantedByUserId: actor.userId,
            },
        });
        const entry = await access.entry(await asIn(b.id, b.ownerId));
        expect(entry).toMatchObject({ ok: true, row: { limit: 3 } });
    });
});

describe("the permission and the switches", () => {
    it("a Member without ai:use is refused; given it as a person, asks", async () => {
        const b = await business();
        const memberId = await person(b.id, "MEMBER");
        const before = await ask(await asIn(b.id, memberId));
        expect(refusalOf(before.events)).toEqual({ reason: "no-permission" });
        expect(before.sent).toBe(0);
        await prisma.membership.update({
            where: {
                organizationId_userId: {
                    organizationId: b.id,
                    userId: memberId,
                },
            },
            data: { extraActions: ["ai:use"] },
        });
        const after = await ask(await asIn(b.id, memberId));
        expect(doneOf(after.events)).toMatchObject({
            outcome: "ANSWERED",
            counted: true,
        });
    });

    it("the business's switch off: refused with whom to ask; history still listed", async () => {
        const b = await business();
        const ctx = await asIn(b.id, b.ownerId);
        await ask(ctx);
        await prisma.aiBusinessSetting.create({
            data: { organizationId: b.id, askAiOn: false },
        });
        const { events, sent } = await ask(ctx);
        expect(refusalOf(events)).toEqual({
            reason: "business-off",
            askName: "Meera",
        });
        expect(sent).toBe(0);
        expect((await conversations.list(ctx)).length).toBeGreaterThan(0);
    });

    it("the Saroh-wide halt beats a per-business ASK_AI override", async () => {
        const b = await business();
        const ctx = await asIn(b.id, b.ownerId);
        expect(await flags.isEnabled(FlagKey.ASK_AI, b.id)).toBe(true);
        await settings.set("ai.halt", true, "access spec halt", actor);
        try {
            const { events, sent } = await ask(ctx);
            expect(refusalOf(events)).toEqual({ reason: "unavailable" });
            expect(sent).toBe(0);
        } finally {
            await settings.set(
                "ai.halt",
                false,
                "access spec halt over",
                actor,
            );
        }
    });
});

describe("the allowance", () => {
    it("counts only counted questions in the period; N-1 → N; at N refused with the window's end", async () => {
        const b = await business("grow");
        const ctx = await asIn(b.id, b.ownerId);
        await usage(ctx);
        await usage(ctx);
        // Stopped before any answer, and failed: neither counts.
        await usage(ctx, { counted: false, outcome: "STOPPED_BEFORE" });
        await usage(ctx, { counted: false, outcome: "FAILED" });
        // Last period's.
        await usage(ctx, { startedAt: new Date(Date.now() - 40 * DAY) });
        expect(await countUsage(prisma, b.id, "aiQuestionsPerMonth")).toBe(2);

        expect(doneOf((await ask(ctx)).events)).toMatchObject({
            outcome: "ANSWERED",
            counted: true,
        });
        expect(await countUsage(prisma, b.id, "aiQuestionsPerMonth")).toBe(3);

        const now = new Date();
        const { events, sent } = await ask(ctx);
        const window = await meterWindow(prisma, b.id, now);
        expect(refusalOf(events)).toEqual({
            reason: "allowance",
            limit: 3,
            resetsAt: window.end,
            requestMore: true,
            askName: null,
        });
        expect(sent).toBe(0);
        expect(await countUsage(prisma, b.id, "aiQuestionsPerMonth")).toBe(3);

        // A Member who may ask is told whom to ask for more instead.
        const memberId = await person(b.id, "MEMBER");
        await prisma.membership.update({
            where: {
                organizationId_userId: {
                    organizationId: b.id,
                    userId: memberId,
                },
            },
            data: { extraActions: ["ai:use"] },
        });
        expect(
            refusalOf((await ask(await asIn(b.id, memberId))).events),
        ).toMatchObject({ requestMore: false, askName: "Meera" });
    });
});

describe("Request more", () => {
    it("a Member is refused; the Owner's makes one open request; a grant raises the allowance", async () => {
        const b = await business("grow");
        const owner = await asIn(b.id, b.ownerId);
        const memberId = await person(b.id, "MEMBER");
        await prisma.membership.update({
            where: {
                organizationId_userId: {
                    organizationId: b.id,
                    userId: memberId,
                },
            },
            data: { extraActions: ["ai:use"] },
        });
        await expect(
            requests.requestMore(await asIn(b.id, memberId)),
        ).rejects.toBeInstanceOf(ForbiddenException);

        for (let i = 0; i < 3; i++) await usage(owner);
        const first = await requests.requestMore(owner);
        const again = await requests.requestMore(owner);
        expect(again.id).toBe(first.id);
        expect(
            await prisma.aiRequest.findUniqueOrThrow({
                where: { id: first.id },
            }),
        ).toMatchObject({ status: "OPEN", userId: b.ownerId });
        expect(refusalOf((await ask(owner)).events)).toMatchObject({
            reason: "allowance",
        });

        await requests.grant(first.id, actor.userId, 1, "launch week");
        expect(
            await prisma.subscriptionAddon.findFirstOrThrow({
                where: { organizationId: b.id },
            }),
        ).toMatchObject({ addonId: "more-questions", quantity: 1 });
        expect(
            await prisma.aiRequest.findUniqueOrThrow({
                where: { id: first.id },
            }),
        ).toMatchObject({ status: "GRANTED", packs: 1 });
        // 3 + one pack of 2.
        expect(doneOf((await ask(owner)).events)).toMatchObject({
            outcome: "ANSWERED",
            counted: true,
        });
        await expect(
            requests.grant(first.id, actor.userId, 1, "twice"),
        ).rejects.toBeInstanceOf(ConflictException);
    });
});

describe("the day's cost", () => {
    it("refuses at the business's day limit, not counted and recorded; the next zone day is allowed", async () => {
        const b = await business();
        await setFor(b.id, "askAi.businessDayCostCapMicroUsd", 3 * CAP);
        const owner = await asIn(b.id, b.ownerId);
        const other = await asIn(b.id, await person(b.id, "ADMIN"));
        const now = new Date();
        await usage(owner, {
            counted: false,
            outcome: "FAILED",
            costMicroUsd: 1.5 * CAP,
            startedAt: new Date(now.getTime() - 60_000),
        });
        // 1.5 spent + 1 held for this one: within 3.
        expect(await start(owner, now)).toBeNull();
        // 1.5 + 1 held for the running one + 1 for this: past 3.
        expect(await start(other, now)).toEqual({
            reason: "daily-limit",
            scope: "business",
        });
        const recorded = await prisma.aiUsage.findMany({
            where: { organizationId: b.id, outcome: "DAILY_LIMIT" },
        });
        expect(recorded).toHaveLength(1);
        expect(recorded[0]).toMatchObject({ counted: false, costMicroUsd: 0 });

        const tomorrow = new Date(now.getTime() + DAY);
        expect(await start(other, tomorrow)).toBeNull();
    });

    it("two questions at once with room for one: one is refused", async () => {
        const b = await business();
        await setFor(b.id, "askAi.businessDayCostCapMicroUsd", 2 * CAP);
        const owner = await asIn(b.id, b.ownerId);
        const other = await asIn(b.id, await person(b.id, "ADMIN"));
        const now = new Date();
        await usage(owner, {
            counted: false,
            outcome: "FAILED",
            costMicroUsd: CAP / 2,
            startedAt: new Date(now.getTime() - 60_000),
        });
        const results = await Promise.all([
            start(owner, now),
            start(other, now),
        ]);
        expect(results.filter((r) => r === null)).toHaveLength(1);
        expect(results.filter((r) => r?.reason === "daily-limit")).toHaveLength(
            1,
        );
    });

    it("ten turns stopped before any answer add to the day's cost", async () => {
        const b = await business();
        await setFor(b.id, "askAi.businessDayCostCapMicroUsd", 1.5 * CAP);
        const owner = await asIn(b.id, b.ownerId);
        const now = new Date();
        for (let i = 0; i < 10; i++) {
            await usage(owner, {
                counted: false,
                outcome: "STOPPED_BEFORE",
                costMicroUsd: CAP / 10,
                startedAt: new Date(now.getTime() - 60_000),
            });
        }
        expect(await start(owner, now)).toEqual({
            reason: "daily-limit",
            scope: "business",
        });
        // None of them counted against the questions.
        expect(await countUsage(prisma, b.id, "aiQuestionsPerMonth")).toBe(0);
    });

    it("one running question a person", async () => {
        const b = await business();
        const owner = await asIn(b.id, b.ownerId);
        const now = new Date();
        expect(await start(owner, now)).toBeNull();
        expect(await start(owner, now)).toEqual({ reason: "busy", who: "you" });
    });
});
