/**
 * Saroh's watch over Ask AI against a real Postgres (DEC-220, plan
 * 2026-11-13-001 U8): the spend alarm (warn once, halt once with its
 * reason, an `ASK_AI` override refused after), the failure watch (once an
 * hour), Report this answer (only the chosen exchange, never counted, each
 * console read on the ledger), a setting out of bounds refused, a granted
 * Request more ending with its period, and reports deleted after 90 days.
 *
 * Runs in the integration project (TEST_DATABASE_URL). Spend and failures
 * are Saroh-wide, so the numbers are set against what the database already
 * holds; every amount is in test units, never Saroh's forecast or prices.
 * The halt is lifted again before each test ends.
 */
// The controller's guards load Better Auth (ESM, not loadable here); these
// tests call the controller directly, so the guards never run.
jest.mock("../../../common/guards/better-auth.guard", () => ({
    BetterAuthGuard: class BetterAuthGuard {},
}));
jest.mock("../../../common/guards/platform-admin.guard", () => ({
    PlatformAdminGuard: class PlatformAdminGuard {},
}));

import { randomBytes, randomUUID } from "node:crypto";

import {
    BadRequestException,
    ConflictException,
    NotFoundException,
} from "@nestjs/common";
import { prisma, writeCatalogueVersion } from "@saroh/database";
import { planRows } from "@saroh/pricing-catalog";

import { fakeAskAiCatalog } from "../../../../test/fixtures/pricing-catalog";
import type { PlatformAdminInfo } from "../../../common/decorators/platform-admin-context.decorator";
import type { OrganizationContext } from "../../../common/types/organization-context";
import { env } from "../../../env";
import { AdminAuditService } from "../../admin/admin-audit.service";
import { AdminRole, permissionsFor } from "../../admin/admin-permissions";
import { AddonsService } from "../../billing/addons.service";
import { CatalogueAccessService } from "../../billing/catalogue-access.service";
import { countUsage, meterWindow } from "../../billing/metering";
import { FeatureFlagService } from "../../feature-flags/feature-flags.service";
import { FlagKey } from "../../feature-flags/flags";
import { OrganizationContextService } from "../../organizations/organization-context.service";
import { AskAiAccess } from "../access/ask-ai-access";
import { ConversationsService } from "../conversations.service";
import { AiRetentionJob } from "../history/retention.job";
import { sealMessageBody, sealReportBody } from "../history/sealing";
import { AiReportsService } from "../reports/ai-reports.service";
import { AiRequestsService } from "../requests/ai-requests.service";
import { AiSettingsService } from "../settings/ai-settings.service";
import { TurnStore } from "../turn/turn-store";
import { AdminAskAiController } from "./ai-admin.controller";
import { AiOpsAdminService } from "./ai-ops-admin.service";
import { FailureAlarmJob } from "./failure-alarm.job";
import {
    AI_GRANT_END_TYPE,
    AiGrantEndJob,
    GRANT_END_LEAD_MS,
} from "./grant-end.job";
import type { OwnerAlert, OwnerAlertSender } from "./owner-alert";
import {
    SPEND_ALARM_ACTOR,
    SpendAlarmJob,
    spendMonth,
    spentSince,
} from "./spend-alarm.job";

const mutableEnv = env as { AI_TEXT_ENC_KEY?: string };
const keyBefore = mutableEnv.AI_TEXT_ENC_KEY;

const V = 860_000 + Math.floor(Math.random() * 9_000);
const DAY = 86_400_000;

const settings = new AiSettingsService();
const flags = new FeatureFlagService();
const store = new TurnStore(new ConversationsService());
const access = new AskAiAccess(
    settings,
    flags,
    store,
    new CatalogueAccessService(flags),
);
const addons = new AddonsService();
const requests = new AiRequestsService(access, addons);
const reports = new AiReportsService();
const ops = new AiOpsAdminService(settings, requests);
const controller = new AdminAskAiController(
    ops,
    reports,
    new AdminAuditService(),
);
const organizations = new OrganizationContextService();
const actor = { userId: "user_test_ai_ops" };

/** Alerts kept instead of emailed. */
class KeptAlerts {
    sent: OwnerAlert[] = [];
    send(alert: OwnerAlert): Promise<number> {
        this.sent.push(alert);
        return Promise.resolve(1);
    }
}

let seq = 0;
const uniq = (label: string) => `${label}-${process.pid}-${++seq}`;

async function person(org: string, role: string) {
    const user = await prisma.user.create({
        data: { email: `${uniq(role.toLowerCase())}@example.com`, name: role },
    });
    await prisma.membership.create({
        data: { organizationId: org, userId: user.id, role },
    });
    return user.id;
}

/** A Grow business billed through the provider, Ask AI rolled out to it. */
async function business() {
    const org = await prisma.organization.create({
        data: { name: "Rye Bakery", slug: uniq("rye"), currency: "INR" },
    });
    const ownerId = await person(org.id, "OWNER");
    await prisma.businessProfile.create({
        data: { organizationId: org.id, timezone: "Asia/Kolkata" },
    });
    const plan = await prisma.plan.findUniqueOrThrow({
        where: {
            key_version_interval: {
                key: "catalog.grow",
                version: V,
                interval: "month",
            },
        },
    });
    await prisma.subscription.create({
        data: {
            organizationId: org.id,
            planId: plan.id,
            status: "ACTIVE",
            provider: "RAZORPAY",
            providerSubscriptionId: uniq("sub"),
            currentPeriodEnd: new Date(Date.now() + 10 * DAY),
        },
    });
    await prisma.featureFlagOverride.create({
        data: {
            flagKey: FlagKey.ASK_AI,
            organizationId: org.id,
            enabled: true,
        },
    });
    return { id: org.id, ownerId };
}

async function usage(
    organizationId: string,
    over: {
        costMicroUsd?: number;
        outcome?: "ANSWERED" | "FAILED";
    } = {},
) {
    const now = new Date();
    const window = await meterWindow(prisma, organizationId, now);
    await prisma.aiUsage.create({
        data: {
            organizationId,
            userId: "user_test_ai_ops",
            turnId: randomUUID(),
            agent: "ask-ai",
            agentVersion: "v",
            model: "claude-haiku-5-5",
            effort: "low",
            windowStart: window.start,
            windowKey: window.key,
            startedAt: now,
            finishedAt: now,
            outcome: over.outcome ?? "ANSWERED",
            counted: over.outcome !== "FAILED",
            costMicroUsd: over.costMicroUsd ?? 0,
        },
    });
}

/** A conversation of two exchanges, as the turn store leaves one. */
async function conversation(ctx: OrganizationContext) {
    const conv = await prisma.aiConversation.create({
        data: {
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            agent: "ask-ai",
            agentVersion: "v",
            model: "claude-haiku-5-5",
            effort: "low",
        },
    });
    const texts = [
        ["USER", "Kal kitni bookings hain?"],
        ["ASSISTANT", "Teen."],
        ["USER", "Aur parso?"],
        ["ASSISTANT", "Do."],
    ] as const;
    const ids: string[] = [];
    let at = Date.now() - 60_000;
    for (const [role, text] of texts) {
        const id = randomUUID();
        const sealed = sealMessageBody(
            { text },
            {
                organizationId: ctx.organizationId,
                conversationId: conv.id,
                rowId: id,
            },
        );
        await prisma.aiMessage.create({
            data: {
                id,
                organizationId: ctx.organizationId,
                conversationId: conv.id,
                role,
                outcome: role === "ASSISTANT" ? "ANSWERED" : null,
                bodyCiphertext: sealed.ciphertext,
                bodyIv: sealed.iv,
                bodyAuthTag: sealed.authTag,
                createdAt: new Date((at += 1000)),
            },
        });
        ids.push(id);
    }
    return { id: conv.id, q1: ids[0]!, a1: ids[1]!, a2: ids[3]! };
}

function staff(role: AdminRole): PlatformAdminInfo {
    return {
        userId: actor.userId,
        platformAdminId: null,
        roles: [role],
        permissions: permissionsFor([role]),
        viaBootstrap: false,
        edition: null,
    };
}

const liftHalt = () =>
    settings.set("ai.halt", false, "ai ops spec over", actor);

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
});
afterAll(() => {
    mutableEnv.AI_TEXT_ENC_KEY = keyBefore;
});

describe("the spend alarm", () => {
    it("under, then warns once, then halts once with its reason; an ASK_AI override is refused after", async () => {
        const alerts = new KeptAlerts();
        const job = new SpendAlarmJob(
            settings,
            alerts as unknown as OwnerAlertSender,
        );
        const month = spendMonth(new Date());
        await prisma.aiAlert.deleteMany({
            where: {
                kind: { in: ["spend-warn", "spend-halt"] },
                windowKey: month.key,
            },
        });
        const b = await business();
        const ctx = await organizations.resolve(b.ownerId, b.id);
        // Large enough that other specs' turns don't move the share.
        await usage(b.id, { costMicroUsd: 1_000_000_000 });
        const spent = await spentSince(month.start);
        const forecast = (v: number) =>
            settings.set(
                "ai.spendForecastMicroUsdPerMonth",
                v,
                "ai ops spec",
                actor,
            );
        await settings.set("ai.spendAlarmWarnRatio", 0.5, "ai ops spec", actor);
        await settings.set("ai.spendAlarmHaltRatio", 1, "ai ops spec", actor);
        try {
            await forecast(spent * 4);
            expect(await job.check()).toBe("under");
            expect(alerts.sent).toHaveLength(0);

            await forecast(Math.ceil(spent * 1.5));
            expect(await job.check()).toBe("warn");
            expect(await job.check()).toBe("warn");
            expect(alerts.sent).toHaveLength(1);
            expect((await access.entry(ctx)).ok).toBe(true);

            const halts = () =>
                prisma.aiSetting.count({ where: { key: "ai.halt" } });
            await forecast(Math.floor(spent * 0.9));
            expect(await job.check()).toBe("halt");
            const rowsAfterHalt = await halts();
            expect(await job.check()).toBe("halt");
            expect(await halts()).toBe(rowsAfterHalt);
            expect(alerts.sent).toHaveLength(2);
            const newest = (await settings.history("ai.halt"))[0]!;
            expect(newest).toMatchObject({
                value: true,
                setByUserId: SPEND_ALARM_ACTOR,
            });
            expect(newest.reason).toMatch(/^spend alarm/);
            expect(await settings.halt()).toMatchObject({ halted: true });
            expect(await flags.isEnabled(FlagKey.ASK_AI, b.id)).toBe(true);
            expect(await access.entry(ctx)).toEqual({
                ok: false,
                refusal: { reason: "unavailable" },
            });
            // Numbers only: no question or answer in an alert.
            expect(JSON.stringify(alerts.sent)).not.toMatch(/bookings/i);
        } finally {
            await liftHalt();
            await forecast(1_000_000_000_000);
        }
    });
});

describe("the failure watch", () => {
    it("emails once an hour when the failed share is above the setting", async () => {
        const alerts = new KeptAlerts();
        const job = new FailureAlarmJob(
            settings,
            alerts as unknown as OwnerAlertSender,
        );
        const now = new Date();
        await prisma.aiAlert.deleteMany({
            where: {
                kind: "failures",
                windowKey: now.toISOString().slice(0, 13),
            },
        });
        await settings.set("ai.failureAlarmRatio", 0.01, "ai ops spec", actor);
        await settings.set("ai.failureAlarmMinTurns", 1, "ai ops spec", actor);
        const b = await business();
        for (let i = 0; i < 50; i++) await usage(b.id, { outcome: "FAILED" });
        expect(await job.check(now)).toBe(true);
        expect(await job.check(now)).toBe(false);
        expect(alerts.sent).toHaveLength(1);
    });
});

describe("Report this answer", () => {
    it("holds only the chosen exchange, doesn't count, and each console read is on the ledger", async () => {
        const b = await business();
        const ctx = await organizations.resolve(b.ownerId, b.id);
        const conv = await conversation(ctx);
        const counted = await countUsage(prisma, b.id, "aiQuestionsPerMonth");
        const usages = await prisma.aiUsage.count({
            where: { organizationId: b.id },
        });

        const made = await reports.report(ctx, {
            messageId: conv.a1,
            reason: "WRONG_NUMBER",
            note: "Kal chaar thi",
        });
        await expect(
            reports.report(ctx, {
                messageId: conv.a1,
                reason: "SOMETHING_ELSE",
            }),
        ).rejects.toBeInstanceOf(ConflictException);
        // Not an answer, and not the asker's own: not there.
        await expect(
            reports.report(ctx, { messageId: conv.q1, reason: "WRONG_NUMBER" }),
        ).rejects.toBeInstanceOf(NotFoundException);
        const memberId = await person(b.id, "MEMBER");
        await expect(
            reports.report(await organizations.resolve(memberId, b.id), {
                messageId: conv.a2,
                reason: "WRONG_NUMBER",
            }),
        ).rejects.toBeInstanceOf(NotFoundException);

        const view = await controller.askAiReport(
            staff(AdminRole.Support),
            null,
            made.id,
        );
        expect(view).toMatchObject({
            question: "Kal kitni bookings hain?",
            answer: "Teen.",
            note: "Kal chaar thi",
            reason: "WRONG_NUMBER",
            status: "OPEN",
        });
        expect(JSON.stringify(view)).not.toMatch(/parso|Do\./);
        expect(
            await prisma.adminAuditEvent.count({
                where: { action: "ai.report.read", targetId: made.id },
            }),
        ).toBe(1);

        expect(await countUsage(prisma, b.id, "aiQuestionsPerMonth")).toBe(
            counted,
        );
        expect(
            await prisma.aiUsage.count({ where: { organizationId: b.id } }),
        ).toBe(usages);
    });

    it("deletes reports 90 days after they were made", async () => {
        const b = await business();
        const ctx = await organizations.resolve(b.ownerId, b.id);
        const conv = await conversation(ctx);
        const report = async (messageId: string, ageDays: number) => {
            const id = randomUUID();
            const sealed = sealReportBody(
                { question: "q", answer: "a", note: null },
                {
                    organizationId: b.id,
                    conversationId: conv.id,
                    rowId: id,
                },
            );
            await prisma.aiReport.create({
                data: {
                    id,
                    organizationId: b.id,
                    userId: b.ownerId,
                    conversationId: conv.id,
                    messageId,
                    reason: "DIDNT_UNDERSTAND",
                    bodyCiphertext: sealed.ciphertext,
                    bodyIv: sealed.iv,
                    bodyAuthTag: sealed.authTag,
                    createdAt: new Date(Date.now() - ageDays * DAY),
                },
            });
            return id;
        };
        const old = await report(conv.a1, 91);
        const young = await report(conv.a2, 89);
        await new AiRetentionJob().sweep(new Date());
        expect(
            await prisma.aiReport.findUnique({ where: { id: old } }),
        ).toBeNull();
        expect(
            await prisma.aiReport.findUnique({ where: { id: young } }),
        ).not.toBeNull();
    });
});

describe("the console's settings", () => {
    it("refuses a value out of bounds, and keeps a change with its reason in history and on the ledger", async () => {
        const key = "ai.spendAlarmWarnRatio";
        const before = (await settings.history(key)).length;
        const refused = randomUUID();
        await expect(
            controller.setAskAiSetting(staff(AdminRole.PlatformOwner), key, {
                value: 50,
                reason: "far too high",
                idempotencyKey: refused,
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(await settings.history(key)).toHaveLength(before);
        expect(
            await prisma.adminAuditEvent.count({
                where: { idempotencyKey: refused },
            }),
        ).toBe(0);

        const kept = randomUUID();
        await controller.setAskAiSetting(staff(AdminRole.PlatformOwner), key, {
            value: 0.75,
            reason: "warn a little later",
            idempotencyKey: kept,
        });
        expect((await settings.history(key))[0]).toMatchObject({
            value: 0.75,
            reason: "warn a little later",
        });
        expect(
            await prisma.adminAuditEvent.count({
                where: { idempotencyKey: kept, action: "ai.setting.set" },
            }),
        ).toBe(1);
    });
});

describe("Request more's grant", () => {
    it("adds a pack for this period, and takes it off just before the period ends, once", async () => {
        const b = await business();
        const now = new Date();
        const window = await meterWindow(prisma, b.id, now);
        const request = await prisma.aiRequest.create({
            data: {
                organizationId: b.id,
                userId: b.ownerId,
                windowKey: window.key,
            },
        });
        await controller.grantAskAiRequest(
            staff(AdminRole.PlatformOwner),
            request.id,
            { reason: "launch week", idempotencyKey: randomUUID() },
        );
        expect(
            await prisma.subscriptionAddon.findFirstOrThrow({
                where: { organizationId: b.id },
            }),
        ).toMatchObject({ addonId: "more-questions", quantity: 1 });
        const endsAt = new Date(window.end.getTime() - GRANT_END_LEAD_MS);
        expect(
            await prisma.aiRequest.findUniqueOrThrow({
                where: { id: request.id },
            }),
        ).toMatchObject({ status: "GRANTED", packs: 1, packsEndAt: endsAt });
        const job = await prisma.job.findFirstOrThrow({
            where: { type: AI_GRANT_END_TYPE, organizationId: b.id },
        });
        expect(job.runAt).toEqual(endsAt);
        expect(job.payload).toEqual({
            requestId: request.id,
            addonId: "more-questions",
        });
        expect(
            await prisma.adminAuditEvent.count({
                where: { action: "ai.request.grant", targetId: request.id },
            }),
        ).toBe(1);

        const ending = new AiGrantEndJob(addons);
        expect(await ending.end(request.id, "more-questions", endsAt)).toBe(
            true,
        );
        expect(
            await prisma.subscriptionAddon.findFirst({
                where: { organizationId: b.id },
            }),
        ).toBeNull();
        expect(await ending.end(request.id, "more-questions", endsAt)).toBe(
            false,
        );
    });
});
