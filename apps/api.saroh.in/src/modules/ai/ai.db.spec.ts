/**
 * Ask AI's layer against a real Postgres (DEC-220, plan 2026-11-13-001 U3):
 * a conversation is its owner's alone; another business reaches none of
 * it under row-level security; text at rest is ciphertext; the 90-day
 * sweep deletes only old conversations and keeps usage numbers; settings
 * are written once each; and a key-ring re-seal moves Ask AI's text and
 * still opens it in place.
 *
 * Runs in the integration project (TEST_DATABASE_URL); the RLS and trigger
 * cases only under TEST_RLS=on, where the schema comes from the migrations.
 */
import { randomBytes, randomUUID } from "node:crypto";

import { NotFoundException } from "@nestjs/common";
import { prisma, runInOrgContext } from "@saroh/database";

import { isRlsTestMode } from "../../../test/rls-mode";
import { resealAll } from "../../cli/keys-reseal";
import { storedKeyId } from "../../common/crypto";
import type { OrganizationContext } from "../../common/types/organization-context";
import { env } from "../../env";
import { ConversationsService } from "./conversations.service";
import { AI_RETENTION_MS, AiRetentionJob } from "./history/retention.job";
import {
    AiSealMismatchError,
    openMessageBody,
    sealAiText,
    sealMessageBody,
} from "./history/sealing";
import { AiSettingsService } from "./settings/ai-settings.service";

const mutableEnv = env as { AI_TEXT_ENC_KEY?: string };
const before = mutableEnv.AI_TEXT_ENC_KEY;
// Throwaway keys for this run only, never a value in the repo.
const oldKey = randomBytes(32).toString("base64");

const conversations = new ConversationsService();
const settings = new AiSettingsService();

let seq = 0;
const uniq = (label: string) => `${label}-${process.pid}-${++seq}`;
const DAY = 24 * 60 * 60 * 1000;

interface Business {
    organizationId: string;
    owner: OrganizationContext;
    member: OrganizationContext;
}

async function business(): Promise<Business> {
    const org = await prisma.organization.create({
        data: { name: "Rye & Co.", slug: uniq("ai-org") },
    });
    const people = await Promise.all(
        (["OWNER", "MEMBER"] as const).map(async (role) => {
            const user = await prisma.user.create({
                data: { email: `${uniq("ai-user")}@example.test` },
            });
            await prisma.membership.create({
                data: { organizationId: org.id, userId: user.id, role },
            });
            return { organizationId: org.id, userId: user.id, role };
        }),
    );
    return { organizationId: org.id, owner: people[0], member: people[1] };
}

/** A conversation with one sealed question and its usage row. */
async function conversation(
    ctx: OrganizationContext,
    opts: { text?: string; lastMessageAt?: Date } = {},
) {
    const id = randomUUID();
    const messageId = randomUUID();
    const where = { organizationId: ctx.organizationId, conversationId: id };
    const title = sealAiText("Bookings tomorrow", {
        ...where,
        rowId: id,
        field: "title",
    });
    await prisma.aiConversation.create({
        data: {
            id,
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            agent: "ask-ai",
            agentVersion: "test",
            model: "claude-haiku-5-5",
            effort: "low",
            titleCiphertext: title.ciphertext,
            titleIv: title.iv,
            titleAuthTag: title.authTag,
            lastMessageAt: opts.lastMessageAt ?? new Date(),
        },
    });
    const body = sealMessageBody(
        { text: opts.text ?? "Kal kitne bookings hain?" },
        { ...where, rowId: messageId },
    );
    await prisma.aiMessage.create({
        data: {
            id: messageId,
            organizationId: ctx.organizationId,
            conversationId: id,
            role: "USER",
            bodyCiphertext: body.ciphertext,
            bodyIv: body.iv,
            bodyAuthTag: body.authTag,
        },
    });
    const usage = await prisma.aiUsage.create({
        data: {
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            conversationId: id,
            turnId: randomUUID(),
            agent: "ask-ai",
            agentVersion: "test",
            model: "claude-haiku-5-5",
            effort: "low",
            windowStart: new Date(),
            windowKey: "2026-11",
            inputTokens: 120,
            outputTokens: 40,
            costMicroUsd: 7,
            outcome: "ANSWERED",
            counted: true,
            finishedAt: new Date(),
        },
    });
    return { id, messageId, usageId: usage.id };
}

beforeAll(() => {
    mutableEnv.AI_TEXT_ENC_KEY = oldKey;
});
afterAll(() => {
    mutableEnv.AI_TEXT_ENC_KEY = before;
});

describe("Ask AI conversations", () => {
    it("lists and opens its owner's conversation", async () => {
        const b = await business();
        const c = await conversation(b.owner);
        const list = await conversations.list(b.owner);
        expect(list.map((x) => x.id)).toEqual([c.id]);
        expect(list[0].title).toBe("Bookings tomorrow");
        const view = await conversations.get(b.owner, c.id);
        expect(view.messages).toEqual([
            expect.objectContaining({
                id: c.messageId,
                role: "USER",
                text: "Kal kitne bookings hain?",
            }),
        ]);
    });

    it("is not there for another member, or another business's owner", async () => {
        const b = await business();
        const other = await business();
        const c = await conversation(b.owner);
        await expect(conversations.get(b.member, c.id)).rejects.toBeInstanceOf(
            NotFoundException,
        );
        await expect(
            conversations.get(other.owner, c.id),
        ).rejects.toBeInstanceOf(NotFoundException);
        // Even with the right person but the business the caller names wrong.
        await expect(
            conversations.get(
                { ...b.owner, organizationId: other.organizationId },
                c.id,
            ),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(await conversations.list(b.member)).toEqual([]);
    });

    it("keeps no question or title in the clear", async () => {
        const b = await business();
        const secret = `Asha Verma ka number ${uniq("n")}`;
        const c = await conversation(b.owner, { text: secret });
        const rows = await prisma.$queryRaw<unknown[]>`
            SELECT m.*, c."titleCiphertext"
            FROM "AiMessage" m JOIN "AiConversation" c ON c.id = m."conversationId"
            WHERE m.id = ${c.messageId}`;
        const raw = JSON.stringify(rows);
        expect(raw).not.toContain("Asha");
        expect(raw).not.toContain("Bookings tomorrow");
    });

    it("won't open a body copied onto another business's row", async () => {
        const a = await business();
        const b = await business();
        const mine = await conversation(a.owner, { text: "mine" });
        const theirs = await conversation(b.owner, { text: "theirs" });
        const stolen = await prisma.aiMessage.findUniqueOrThrow({
            where: { id: mine.messageId },
        });
        await prisma.aiMessage.update({
            where: { id: theirs.messageId },
            data: {
                bodyCiphertext: stolen.bodyCiphertext,
                bodyIv: stolen.bodyIv,
                bodyAuthTag: stolen.bodyAuthTag,
            },
        });
        await expect(
            conversations.get(b.owner, theirs.id),
        ).rejects.toBeInstanceOf(AiSealMismatchError);
    });
});

describe("Ask AI retention", () => {
    it("deletes conversations 90 days after their last message only, keeping usage numbers", async () => {
        const b = await business();
        const held = await business();
        await prisma.organization.update({
            where: { id: held.organizationId },
            data: { legalHoldAt: new Date() },
        });
        const now = new Date();
        const old = await conversation(b.owner, {
            lastMessageAt: new Date(now.getTime() - AI_RETENTION_MS - DAY),
        });
        const recent = await conversation(b.owner, {
            lastMessageAt: new Date(now.getTime() - AI_RETENTION_MS + DAY),
        });
        const keptByHold = await conversation(held.owner, {
            lastMessageAt: new Date(now.getTime() - AI_RETENTION_MS - DAY),
        });

        const job = new AiRetentionJob();
        job.batch = 1;
        expect(await job.sweep(now)).toBeGreaterThanOrEqual(1);

        expect(
            await prisma.aiConversation.findUnique({ where: { id: old.id } }),
        ).toBeNull();
        expect(
            await prisma.aiMessage.count({ where: { conversationId: old.id } }),
        ).toBe(0);
        const usage = await prisma.aiUsage.findUniqueOrThrow({
            where: { id: old.usageId },
        });
        expect(usage).toMatchObject({
            conversationId: null,
            inputTokens: 120,
            outputTokens: 40,
            costMicroUsd: 7,
            counted: true,
        });
        for (const kept of [recent, keptByHold]) {
            expect(
                await prisma.aiConversation.count({ where: { id: kept.id } }),
            ).toBe(1);
        }
        // Again: nothing more of these goes.
        await job.sweep(now);
        expect(
            await prisma.aiConversation.count({
                where: { id: { in: [recent.id, keptByHold.id] } },
            }),
        ).toBe(2);
    });
});

describe("AI settings", () => {
    it("keeps every change as its own row, newest in effect winning", async () => {
        const key = "askAi.maxRounds";
        const actor = { userId: uniq("staff") };
        const start = (await settings.history(key)).length;
        const t = Date.now();
        await settings.set(key, 3, "first", actor, new Date(t - 2000));
        await settings.set(key, 5, "more rounds", actor, new Date(t - 1000));
        const history = await settings.history(key);
        expect(history).toHaveLength(start + 2);
        expect(await settings.get(key)).toBe(5);
    });
});

describe("re-sealing Ask AI text", () => {
    it("moves a message onto the new key and still opens it in place", async () => {
        const b = await business();
        const c = await conversation(b.owner, { text: "re-seal me" });
        mutableEnv.AI_TEXT_ENC_KEY = `v2:${randomBytes(32).toString("base64")},v1:${oldKey}`;
        try {
            const report = await resealAll({
                dryRun: false,
                keyName: "AI_TEXT_ENC_KEY",
            });
            const messages = report.targets.find(
                (x) => x.label === "Ask AI messages",
            );
            expect(messages?.moved.v1).toBeGreaterThanOrEqual(1);
            const row = await prisma.aiMessage.findUniqueOrThrow({
                where: { id: c.messageId },
            });
            expect(storedKeyId(row.bodyCiphertext)).toBe("v2");
            expect(
                openMessageBody(
                    {
                        ciphertext: row.bodyCiphertext,
                        iv: row.bodyIv,
                        authTag: row.bodyAuthTag,
                    },
                    {
                        organizationId: b.organizationId,
                        conversationId: c.id,
                        rowId: c.messageId,
                    },
                ).text,
            ).toBe("re-seal me");
            const view = await conversations.get(b.owner, c.id);
            expect(view.title).toBe("Bookings tomorrow");
        } finally {
            mutableEnv.AI_TEXT_ENC_KEY = oldKey;
        }
    });
});

const describeRls = isRlsTestMode() ? describe : describe.skip;

// RLS mode builds the schema from the migrations, so only there do the
// policies, CHECKs and the written-once trigger exist.
describeRls(
    "row-level security, CHECKs and triggers on Ask AI's tables",
    () => {
        it("another business reads none of its conversations, messages or usage", async () => {
            const a = await business();
            const b = await business();
            await conversation(a.owner);
            await conversation(b.owner);
            const counts = () =>
                Promise.all([
                    prisma.aiConversation.count({
                        where: {
                            organizationId: {
                                in: [a.organizationId, b.organizationId],
                            },
                        },
                    }),
                    prisma.aiMessage.count({
                        where: {
                            organizationId: {
                                in: [a.organizationId, b.organizationId],
                            },
                        },
                    }),
                    prisma.aiUsage.count({
                        where: {
                            organizationId: {
                                in: [a.organizationId, b.organizationId],
                            },
                        },
                    }),
                ]);
            expect(await runInOrgContext(a.organizationId, counts)).toEqual([
                1, 1, 1,
            ]);
            expect(await runInOrgContext("org_does_not_exist", counts)).toEqual(
                [0, 0, 0],
            );
            expect(await counts()).toEqual([2, 2, 2]);
        });

        it("refuses an edit to a setting, and a setting with no reason", async () => {
            const row = await prisma.aiSetting.create({
                data: {
                    key: "askAi.maxRounds",
                    value: 4,
                    reason: "start",
                    setByUserId: uniq("staff"),
                },
            });
            await expect(
                prisma.aiSetting.update({
                    where: { id: row.id },
                    data: { value: 40 },
                }),
            ).rejects.toThrow(/written once/);
            await expect(
                prisma.aiSetting.create({
                    data: {
                        key: "askAi.maxRounds",
                        value: 4,
                        reason: "  ",
                        setByUserId: "x",
                    },
                }),
            ).rejects.toThrow();
        });

        it("refuses negative token counts and a running turn marked counted", async () => {
            const b = await business();
            const base = {
                organizationId: b.organizationId,
                userId: b.owner.userId,
                agent: "ask-ai",
                agentVersion: "test",
                model: "claude-haiku-5-5",
                effort: "low",
                windowStart: new Date(),
                windowKey: "2026-11",
            };
            await expect(
                prisma.aiUsage.create({
                    data: { ...base, turnId: randomUUID(), inputTokens: -1 },
                }),
            ).rejects.toThrow();
            await expect(
                prisma.aiUsage.create({
                    data: { ...base, turnId: randomUUID(), counted: true },
                }),
            ).rejects.toThrow();
        });
    },
);
