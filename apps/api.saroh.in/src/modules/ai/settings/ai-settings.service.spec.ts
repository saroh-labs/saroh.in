/**
 * The AI settings store with an in-memory stand-in for its two tables:
 * values checked against their key, a reason always, the newest row in
 * effect winning, a business's override (and its expiry and early end),
 * and the halt, which no override reaches. The trigger that refuses an
 * edit is the db spec's.
 */
interface Row {
    id: string;
    organizationId?: string;
    key: string;
    value: unknown;
    reason: string;
    setByUserId: string;
    effectiveFrom: Date;
    expiresAt?: Date | null;
    createdAt: Date;
}

const tables: Record<"aiSetting" | "aiSettingOverride", Row[]> = {
    aiSetting: [],
    aiSettingOverride: [],
};
let seq = 0;

function table(rows: Row[]) {
    const matching = (where: {
        key: string;
        organizationId?: string;
        effectiveFrom?: { lte: Date };
    }) =>
        rows
            .filter(
                (r) =>
                    r.key === where.key &&
                    (where.organizationId === undefined ||
                        r.organizationId === where.organizationId) &&
                    (!where.effectiveFrom ||
                        r.effectiveFrom <= where.effectiveFrom.lte),
            )
            .sort(
                (a, b) =>
                    b.effectiveFrom.getTime() - a.effectiveFrom.getTime() ||
                    b.createdAt.getTime() - a.createdAt.getTime(),
            );
    return {
        create: jest.fn(({ data }: { data: Omit<Row, "id" | "createdAt"> }) => {
            const row: Row = {
                ...data,
                effectiveFrom: data.effectiveFrom ?? new Date(),
                value:
                    data.value === Prisma.DbNull
                        ? null
                        : (data.value as unknown),
                id: `row${++seq}`,
                createdAt: new Date(Date.now() + seq),
            };
            rows.push(row);
            return Promise.resolve(row);
        }),
        findFirst: jest.fn(
            ({ where }: { where: Parameters<typeof matching>[0] }) =>
                Promise.resolve(matching(where)[0] ?? null),
        ),
        findMany: jest.fn(
            ({ where }: { where: Parameters<typeof matching>[0] }) =>
                Promise.resolve(matching(where)),
        ),
    };
}

const Prisma = { DbNull: Symbol("DbNull") };
jest.mock("@saroh/database", () => ({
    Prisma,
    prisma: {
        aiSetting: table(tables.aiSetting),
        aiSettingOverride: table(tables.aiSettingOverride),
    },
}));

import { BadRequestException } from "@nestjs/common";

import {
    AiSettingNotConfiguredError,
    AiSettingsService,
} from "./ai-settings.service";

const settings = new AiSettingsService();
const owner = { userId: "user_owner" };
const hour = 60 * 60 * 1000;

beforeEach(() => {
    tables.aiSetting.length = 0;
    tables.aiSettingOverride.length = 0;
});

describe("AiSettingsService", () => {
    it("refuses a key nobody set, never inventing a value", async () => {
        await expect(settings.get("askAi.maxRounds")).rejects.toBeInstanceOf(
            AiSettingNotConfiguredError,
        );
    });

    it("refuses an unknown model, an unknown key, an out-of-bounds cap and a missing reason", async () => {
        await expect(
            settings.set("askAi.questions.model", "gpt-x", "try", owner),
        ).rejects.toBeInstanceOf(BadRequestException);
        await expect(
            settings.set("askAi.nope", 1, "try", owner),
        ).rejects.toBeInstanceOf(BadRequestException);
        for (const bad of [0, -1, 1.5, 51, "4"]) {
            await expect(
                settings.set("askAi.maxRounds", bad, "try", owner),
            ).rejects.toBeInstanceOf(BadRequestException);
        }
        await expect(
            settings.set("askAi.turnCostCapMicroUsd", -1, "try", owner),
        ).rejects.toBeInstanceOf(BadRequestException);
        await expect(
            settings.set("askAi.questions.effort", "max", "try", owner),
        ).rejects.toBeInstanceOf(BadRequestException);
        await expect(
            settings.set("askAi.maxRounds", 4, "   ", owner),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(tables.aiSetting).toHaveLength(0);
    });

    it("keeps every change and reads the newest in effect", async () => {
        const now = new Date();
        await settings.set(
            "askAi.questions.model",
            "claude-haiku-5-5",
            "first",
            owner,
            new Date(now.getTime() - 2 * hour),
        );
        await settings.set(
            "askAi.questions.model",
            "claude-sonnet-5-5",
            "better answers",
            owner,
            new Date(now.getTime() - hour),
        );
        // Scheduled for later: not in effect yet.
        await settings.set(
            "askAi.questions.model",
            "claude-opus-5-5",
            "later",
            owner,
            new Date(now.getTime() + hour),
        );
        expect(
            await settings.get("askAi.questions.model", undefined, now),
        ).toBe("claude-sonnet-5-5");
        const history = await settings.history("askAi.questions.model");
        expect(history.map((r) => r.reason)).toEqual([
            "later",
            "better answers",
            "first",
        ]);
    });

    it("lets a business's override win for that business only, until it expires or ends", async () => {
        const now = new Date();
        const at = (ms: number) => new Date(now.getTime() + ms);
        await settings.set("askAi.maxRounds", 4, "start", owner, at(-2 * hour));
        await settings.setOverride(
            "org_test",
            "askAi.maxRounds",
            6,
            "trying more rounds",
            owner,
            {
                effectiveFrom: at(-hour),
                expiresAt: at(hour),
            },
        );
        expect(await settings.get("askAi.maxRounds", "org_test", now)).toBe(6);
        expect(await settings.get("askAi.maxRounds", "org_other", now)).toBe(4);
        expect(await settings.get("askAi.maxRounds", undefined, now)).toBe(4);
        // Past its expiry, the Saroh-wide value applies again.
        expect(
            await settings.get("askAi.maxRounds", "org_test", at(2 * hour)),
        ).toBe(4);

        await settings.endOverride(
            "org_test",
            "askAi.maxRounds",
            "done trying",
            owner,
        );
        expect(await settings.get("askAi.maxRounds", "org_test")).toBe(4);
    });

    it("refuses an override that ends before it starts", async () => {
        const now = new Date();
        await expect(
            settings.setOverride("org_test", "askAi.maxRounds", 6, "x", owner, {
                effectiveFrom: now,
                expiresAt: now,
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuses a stored value that no longer passes its check", async () => {
        tables.aiSetting.push({
            id: "old",
            key: "askAi.drafts.model",
            value: "a-model-taken-off-the-list",
            reason: "long ago",
            setByUserId: "u",
            effectiveFrom: new Date(0),
            createdAt: new Date(0),
        });
        await expect(settings.get("askAi.drafts.model")).rejects.toMatchObject({
            key: "askAi.drafts.model",
            invalid: true,
        });
    });

    describe("the halt", () => {
        it("is off until someone halts, and says why when on", async () => {
            expect(await settings.halt()).toEqual({ halted: false });
            await settings.set("ai.halt", true, "spend alarm", owner);
            expect(await settings.halt()).toEqual({
                halted: true,
                reason: "spend alarm",
            });
            await settings.set("ai.halt", false, "checked, resumed", owner);
            expect(await settings.halt()).toEqual({ halted: false });
        });

        it("can't be overridden for one business, and no override is read for it", async () => {
            await expect(
                settings.setOverride("org_test", "ai.halt", false, "x", owner),
            ).rejects.toBeInstanceOf(BadRequestException);
            await settings.set("ai.halt", true, "stop", owner);
            tables.aiSettingOverride.push({
                id: "planted",
                organizationId: "org_test",
                key: "ai.halt",
                value: false,
                reason: "planted",
                setByUserId: "u",
                effectiveFrom: new Date(0),
                createdAt: new Date(0),
            });
            expect(await settings.get("ai.halt", "org_test")).toBe(true);
        });

        it("refuses a value that isn't a boolean", async () => {
            await expect(
                settings.set("ai.halt", "yes", "x", owner),
            ).rejects.toBeInstanceOf(BadRequestException);
        });
    });
});
