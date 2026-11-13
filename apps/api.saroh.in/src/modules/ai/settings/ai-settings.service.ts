import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma, prisma } from "@saroh/database";

import type { AiSettingKey, AiSettingValue } from "./ai-setting-keys";
import {
    AI_SETTING_SCHEMAS,
    isAiSettingKey,
    NOT_OVERRIDABLE,
} from "./ai-setting-keys";

/**
 * The AI settings (DEC-220): Saroh-wide rows, written once each with a
 * reason (`AiSetting`; the migration's trigger refuses an update), so the
 * history is the table. The newest row in effect wins. A business may have
 * an override for trying a change there first (`AiSettingOverride`): its
 * newest row in effect decides, and one already expired means none.
 *
 * Nothing here invents a value. A key nobody has set, or whose stored value
 * no longer passes its schema (a model taken off the list), is refused with
 * {@link AiSettingNotConfiguredError}, which the caller turns into "Ask AI
 * isn't available right now".
 */

export class AiSettingNotConfiguredError extends Error {
    constructor(
        readonly key: AiSettingKey,
        readonly invalid = false,
    ) {
        super(
            invalid
                ? `AI setting ${key} holds a value that no longer passes its check`
                : `AI setting ${key} is not configured`,
        );
        this.name = "AiSettingNotConfiguredError";
    }
}

export interface AiSettingActor {
    userId: string;
}

export interface AiSettingRecord {
    id: string;
    key: string;
    value: unknown;
    reason: string;
    setByUserId: string;
    effectiveFrom: Date;
    createdAt: Date;
}

/** Where a write goes: Prisma, or a transaction that also audits it (U8). */
export type AiSettingsDb = Pick<
    Prisma.TransactionClient,
    "aiSetting" | "aiSettingOverride"
>;

const NEWEST = [
    { effectiveFrom: "desc" as const },
    { createdAt: "desc" as const },
];

/** `value` checked against `key`'s schema, or a 400 saying what is wrong. */
export function validateAiSetting<K extends AiSettingKey>(
    key: K,
    value: unknown,
): AiSettingValue<K> {
    const parsed = AI_SETTING_SCHEMAS[key].safeParse(value);
    if (!parsed.success) {
        throw new BadRequestException(
            `That value isn't allowed for ${key}: ${parsed.error.issues
                .map((i) => i.message)
                .join("; ")}`,
        );
    }
    return parsed.data as AiSettingValue<K>;
}

function knownKey(key: string): AiSettingKey {
    if (!isAiSettingKey(key)) {
        throw new BadRequestException(`There is no AI setting ${key}`);
    }
    return key;
}

function reasonOf(reason: string): string {
    const r = reason.trim();
    if (!r) throw new BadRequestException("Say why the setting changes");
    return r;
}

@Injectable()
export class AiSettingsService {
    /**
     * The value in effect for `key`: the business's override when it has one
     * in effect and unexpired, else the newest Saroh-wide row.
     */
    async get<K extends AiSettingKey>(
        key: K,
        organizationId?: string,
        now: Date = new Date(),
    ): Promise<AiSettingValue<K>> {
        let stored: Prisma.JsonValue | undefined;
        if (organizationId && !NOT_OVERRIDABLE.has(key)) {
            const override = await prisma.aiSettingOverride.findFirst({
                where: { organizationId, key, effectiveFrom: { lte: now } },
                orderBy: NEWEST,
                select: { value: true, expiresAt: true },
            });
            // No value is an early end; an expired one is no override.
            if (
                override?.value != null &&
                (!override.expiresAt || override.expiresAt > now)
            ) {
                stored = override.value;
            }
        }
        if (stored === undefined) {
            const row = await prisma.aiSetting.findFirst({
                where: { key, effectiveFrom: { lte: now } },
                orderBy: NEWEST,
                select: { value: true },
            });
            if (!row) throw new AiSettingNotConfiguredError(key);
            stored = row.value;
        }
        const parsed = AI_SETTING_SCHEMAS[key].safeParse(stored);
        if (!parsed.success) throw new AiSettingNotConfiguredError(key, true);
        return parsed.data as AiSettingValue<K>;
    }

    /**
     * Whether Saroh has halted every agent, and why. Checked first, before
     * the rollout flag. Never set means not halted: the halt is the one
     * setting whose absence has a meaning (nobody stopped anything).
     */
    async halt(
        now: Date = new Date(),
    ): Promise<{ halted: boolean; reason?: string }> {
        const row = await prisma.aiSetting.findFirst({
            where: { key: "ai.halt", effectiveFrom: { lte: now } },
            orderBy: NEWEST,
            select: { value: true, reason: true },
        });
        if (!row) return { halted: false };
        // A value that isn't a boolean halts: fail closed.
        const halted = row.value !== false;
        return halted ? { halted, reason: row.reason } : { halted };
    }

    /** A new Saroh-wide row: checked, with a reason; never an edit. */
    async set(
        key: string,
        value: unknown,
        reason: string,
        actor: AiSettingActor,
        effectiveFrom: Date = new Date(),
        db: AiSettingsDb = prisma,
    ): Promise<AiSettingRecord> {
        const k = knownKey(key);
        const checked = validateAiSetting(k, value);
        return db.aiSetting.create({
            data: {
                key: k,
                value: checked,
                reason: reasonOf(reason),
                setByUserId: actor.userId,
                effectiveFrom,
            },
        });
    }

    /** A new override for one business, ending at `expiresAt` when given. */
    async setOverride(
        organizationId: string,
        key: string,
        value: unknown,
        reason: string,
        actor: AiSettingActor,
        opts: { effectiveFrom?: Date; expiresAt?: Date } = {},
        db: AiSettingsDb = prisma,
    ): Promise<void> {
        const k = knownKey(key);
        if (NOT_OVERRIDABLE.has(k)) {
            throw new BadRequestException(
                `${k} is Saroh-wide and can't be set for one business`,
            );
        }
        const effectiveFrom = opts.effectiveFrom ?? new Date();
        if (opts.expiresAt && opts.expiresAt <= effectiveFrom) {
            throw new BadRequestException(
                "An override has to end after it starts",
            );
        }
        const checked = validateAiSetting(k, value);
        await db.aiSettingOverride.create({
            data: {
                organizationId,
                key: k,
                value: checked,
                reason: reasonOf(reason),
                setByUserId: actor.userId,
                effectiveFrom,
                expiresAt: opts.expiresAt ?? null,
            },
        });
    }

    /** End a business's override now: a row with no value, so the Saroh-wide one applies again. */
    async endOverride(
        organizationId: string,
        key: string,
        reason: string,
        actor: AiSettingActor,
        db: AiSettingsDb = prisma,
    ): Promise<void> {
        await db.aiSettingOverride.create({
            data: {
                organizationId,
                key: knownKey(key),
                value: Prisma.DbNull,
                reason: reasonOf(reason),
                setByUserId: actor.userId,
            },
        });
    }

    /** Every row ever written for `key`, newest first. */
    async history(key: string): Promise<AiSettingRecord[]> {
        return prisma.aiSetting.findMany({
            where: { key: knownKey(key) },
            orderBy: NEWEST,
        });
    }
}
