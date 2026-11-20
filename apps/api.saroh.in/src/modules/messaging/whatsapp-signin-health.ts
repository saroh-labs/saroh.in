import { Logger } from "@nestjs/common";
import type Redis from "ioredis";

import { env } from "../../env";
import type { OwnerAlert } from "../ai/ops/owner-alert";
import { OwnerAlertSender } from "../ai/ops/owner-alert";
import { sharedRedis } from "../rate-limits/redis-client";

const MINUTE_MS = 60_000;
const WINDOW_MS = 15 * MINUTE_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Defaults when `WHATSAPP_FAILURES_MIN` / `_PERCENT` are unset. */
export const DEFAULT_FAILURES_MIN = 5;
export const DEFAULT_FAILURES_PERCENT = 30;

/**
 * Meta's error codes that break every send, not one number's: the token,
 * the account, its payment, the number's registration, the template.
 * From Meta's Cloud API error codes reference, read 19 Nov 2026:
 * https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes
 * 200-299 (a permission missing or removed) is a range, in {@link accountLevel}.
 */
export const ACCOUNT_LEVEL_CODES: ReadonlyMap<number, string> = new Map([
    [0, "the access token can't be authenticated"],
    [3, "the app lacks a permission it needs"],
    [10, "a permission was not granted or was removed"],
    [190, "the access token has expired or is invalid"],
    [368, "the WhatsApp account is restricted or disabled for a policy"],
    [131031, "the WhatsApp account is locked"],
    [131042, "a payment method problem on the WhatsApp account"],
    [131045, "the sending number has a registration error"],
    [133010, "the sending number is not registered"],
    [132001, "the sign-in template doesn't exist or isn't approved"],
    [132015, "the sign-in template is paused"],
    [132016, "the sign-in template is disabled"],
]);

/** Meta's numeric code in a send's short reason (`whatsapp_190`), else null. */
export function metaCode(reason: string): number | null {
    const match = /^whatsapp_(\d{1,8})$/.exec(reason);
    return match ? Number(match[1]) : null;
}

/**
 * What an account-level failure means, in words; null for a failure that is
 * one number's or one moment's. `unauthorized` is the provider's word for
 * HTTP 401/403 or code 190 (`meta-cloud.provider.ts`).
 */
export function accountLevel(reason: string): string | null {
    if (reason === "unauthorized") {
        return "Meta refused the access token or a permission";
    }
    const code = metaCode(reason);
    if (code === null) return null;
    if (code >= 200 && code <= 299) {
        return "a permission was not granted or was removed";
    }
    return ACCOUNT_LEVEL_CODES.get(code) ?? null;
}

/** At least `min` failures, and at least `percent` of the sends. */
export function isFailing(
    sends: number,
    failures: number,
    min: number,
    percent: number,
): boolean {
    return failures >= min && failures * 100 >= percent * Math.max(sends, 1);
}

/** The commonest reasons first: `whatsapp_131026 ×4, unauthorized ×1`. */
export function topReasons(counts: Record<string, number>, top = 3): string {
    return Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, top)
        .map(([reason, n]) => `${reason} ×${n}`)
        .join(", ");
}

/** What the admin health board reads: the last hour, never a number of a person. */
export interface SignInHealthSummary {
    sends: number;
    failures: number;
    /** The last failure's reason, within a day: `whatsapp_190`, `not_on_whatsapp`. */
    lastError: string | null;
    /** Over the failing threshold, taken over the hour. */
    failing: boolean;
}

/** The few store calls this needs; Redis, or this process's memory. */
export interface HealthStore {
    /** Adds `by` to a hash field, the hash living `ttlMs`. */
    hincr(key: string, field: string, ttlMs: number): Promise<void>;
    hgetall(key: string): Promise<Record<string, string>>;
    /** Sets the key only if absent; true when this call set it. */
    claim(key: string, ttlMs: number): Promise<boolean>;
    /** Deletes the key; true when it was there. */
    take(key: string): Promise<boolean>;
    get(key: string): Promise<string | null>;
    /** Sets the key, returning what it held before. */
    swap(key: string, value: string, ttlMs: number): Promise<string | null>;
}

interface Entry {
    value: string | Map<string, number>;
    expires: number;
}

/** One process's store: the fallback without Redis, and the specs'. */
export class MemoryHealthStore implements HealthStore {
    private readonly map = new Map<string, Entry>();
    constructor(private readonly now: () => number = Date.now) {}

    private live(key: string): Entry | undefined {
        const entry = this.map.get(key);
        if (entry && entry.expires <= this.now()) this.map.delete(key);
        return this.map.get(key);
    }

    hincr(key: string, field: string, ttlMs: number) {
        let entry = this.live(key);
        if (!entry || typeof entry.value === "string") {
            entry = { value: new Map(), expires: this.now() + ttlMs };
            this.map.set(key, entry);
        }
        const hash = entry.value as Map<string, number>;
        hash.set(field, (hash.get(field) ?? 0) + 1);
        return Promise.resolve();
    }

    hgetall(key: string): Promise<Record<string, string>> {
        const value = this.live(key)?.value;
        return Promise.resolve(
            value instanceof Map
                ? Object.fromEntries(
                      [...value].map(([field, n]) => [field, String(n)]),
                  )
                : {},
        );
    }

    claim(key: string, ttlMs: number) {
        if (this.live(key)) return Promise.resolve(false);
        this.map.set(key, { value: "1", expires: this.now() + ttlMs });
        return Promise.resolve(true);
    }

    take(key: string) {
        return Promise.resolve(Boolean(this.live(key)) && this.map.delete(key));
    }

    get(key: string) {
        const value = this.live(key)?.value;
        return Promise.resolve(typeof value === "string" ? value : null);
    }

    async swap(key: string, value: string, ttlMs: number) {
        const before = await this.get(key);
        this.map.set(key, { value, expires: this.now() + ttlMs });
        return before;
    }
}

type RedisCalls = Pick<
    Redis,
    "multi" | "hgetall" | "set" | "del" | "get" | "pexpire"
>;

/**
 * Redis (`REDIS_URL`), the store the WhatsApp ceiling counts in, so every
 * replica shares one count. Any Redis error falls back to this process's
 * memory for that call: health counting never fails a send or a webhook.
 */
export class RedisHealthStore implements HealthStore {
    constructor(
        private readonly redis: RedisCalls,
        private readonly memory: HealthStore = new MemoryHealthStore(),
    ) {}

    private async or<T>(run: () => Promise<T>, fallback: () => Promise<T>) {
        try {
            return await run();
        } catch {
            return fallback();
        }
    }

    hincr(key: string, field: string, ttlMs: number) {
        return this.or(
            async () => {
                await this.redis
                    .multi()
                    .hincrby(key, field, 1)
                    .pexpire(key, ttlMs)
                    .exec();
            },
            () => this.memory.hincr(key, field, ttlMs),
        );
    }

    hgetall(key: string) {
        return this.or(
            () => this.redis.hgetall(key),
            () => this.memory.hgetall(key),
        );
    }

    claim(key: string, ttlMs: number) {
        return this.or(
            async () =>
                (await this.redis.set(key, "1", "PX", ttlMs, "NX")) === "OK",
            () => this.memory.claim(key, ttlMs),
        );
    }

    take(key: string) {
        return this.or(
            async () => (await this.redis.del(key)) > 0,
            () => this.memory.take(key),
        );
    }

    get(key: string) {
        return this.or(
            () => this.redis.get(key),
            () => this.memory.get(key),
        );
    }

    swap(key: string, value: string, ttlMs: number) {
        // shortcut: get then set is not atomic; two replicas taking the same
        // webhook at once could both alert. Meta sends each change once.
        return this.or(
            async () => {
                const before = await this.redis.get(key);
                await this.redis.set(key, value, "PX", ttlMs);
                return before;
            },
            () => this.memory.swap(key, value, ttlMs),
        );
    }
}

let sharedStore: HealthStore | undefined;
function defaultStore(): HealthStore {
    if (!sharedStore) {
        const redis = sharedRedis();
        sharedStore = redis
            ? new RedisHealthStore(redis)
            : new MemoryHealthStore();
    }
    return sharedStore;
}

const KEY = "wa-signin";
const TEMPLATE_BAD = new Set(["PAUSED", "DISABLED", "REJECTED"]);

/**
 * Whether Saroh's WhatsApp sign-in codes are reaching people (owner,
 * 19 Nov). Phone sign-in answers every number alike and sends after the
 * answer, so a send that fails says nothing to the person waiting; this is
 * where Saroh notices instead.
 *
 * - Every account phone WhatsApp send is counted, and every failure: a
 *   refusal at send time, or Meta's `failed` status on the webhook for a
 *   message id remembered here for a day. Counted per 15 minutes in Redis.
 * - Failing (at least `WHATSAPP_FAILURES_MIN` failures and
 *   `WHATSAPP_FAILURES_PERCENT` of sends in the window): ERROR
 *   `account_phone_whatsapp_failing` with the commonest reasons, and an
 *   email to Platform owners, at most once an hour.
 * - Any account-level failure ({@link accountLevel}: the token, the
 *   account, payment, registration, the template): ERROR
 *   `account_phone_whatsapp_account_error` and an email, once an hour per code.
 * - Meta's template webhooks for the configured sign-in template: PAUSED,
 *   DISABLED or REJECTED, or quality RED: ERROR
 *   `account_phone_whatsapp_template` and an email, once per change. Any
 *   other template is not Saroh's sign-in one and is left alone.
 *
 * Reasons are Saroh's short codes and Meta's numbers, never a phone number.
 */
export class WhatsappSignInHealth {
    private readonly logger = new Logger(WhatsappSignInHealth.name);

    constructor(
        private readonly store: HealthStore = defaultStore(),
        private readonly alerts: Pick<
            OwnerAlertSender,
            "send"
        > = new OwnerAlertSender(),
        private readonly min: number = Number(
            env.WHATSAPP_FAILURES_MIN ?? DEFAULT_FAILURES_MIN,
        ) || DEFAULT_FAILURES_MIN,
        private readonly percent: number = Number(
            env.WHATSAPP_FAILURES_PERCENT ?? DEFAULT_FAILURES_PERCENT,
        ) || DEFAULT_FAILURES_PERCENT,
        private readonly template:
            string | undefined = env.MSG91_WHATSAPP_TEMPLATE,
    ) {}

    /** A send was asked of the provider; `messageId` when it accepted it. */
    async sent(messageId?: string, now = Date.now()): Promise<void> {
        await this.store.hincr(window(now), "sent", 2 * HOUR_MS);
        if (messageId)
            await this.store.claim(`${KEY}:msg:${messageId}`, DAY_MS);
    }

    /** Meta's `failed` status for a message: counted once, if it was ours. */
    async deliveryFailed(
        messageId: string,
        reason: string,
        now = Date.now(),
    ): Promise<void> {
        if (!messageId) return;
        if (await this.store.take(`${KEY}:msg:${messageId}`)) {
            await this.failed(reason, now);
        }
    }

    /** A send that failed, by its short reason. */
    async failed(reason: string, now = Date.now()): Promise<void> {
        const key = window(now);
        await this.store.hincr(key, "failed", 2 * HOUR_MS);
        await this.store.hincr(key, `reason:${reason}`, 2 * HOUR_MS);
        await this.store.swap(`${KEY}:last-error`, reason, DAY_MS);

        const meaning = accountLevel(reason);
        if (
            meaning &&
            (await this.store.claim(`${KEY}:alerted:${reason}`, HOUR_MS))
        ) {
            this.logger.error(
                `account_phone_whatsapp_account_error reason=${reason}: ${meaning}; WhatsApp sign-in codes may not be reaching anyone`,
            );
            this.alert(now, {
                subject: "Saroh: WhatsApp sign-in codes are being refused",
                lines: [
                    `Meta refused a sign-in code with ${reason}: ${meaning}.`,
                    "This stops every WhatsApp code, not one person's. People can still get their code by SMS.",
                    "Check Saroh's WhatsApp account in Meta's WhatsApp Manager.",
                ],
            });
        }

        const counts = await this.store.hgetall(key);
        const sends = Number(counts.sent) || 0;
        const failures = Number(counts.failed) || 0;
        if (
            isFailing(sends, failures, this.min, this.percent) &&
            (await this.store.claim(`${KEY}:alerted:failing`, HOUR_MS))
        ) {
            const top = topReasons(reasonsOf(counts));
            this.logger.error(
                `account_phone_whatsapp_failing failures=${failures} sends=${sends} window=15m top=${top}`,
            );
            this.alert(now, {
                subject: "Saroh: WhatsApp sign-in codes are failing",
                lines: [
                    `${failures} of ${sends} WhatsApp sign-in codes failed in the last 15 minutes.`,
                    `Commonest reasons: ${top}.`,
                    "People can still get their code by SMS. Check the API log for account_phone_blocked and Meta's WhatsApp Manager.",
                ],
            });
        }
    }

    /** One of Meta's template webhooks; acts only on the sign-in template. */
    async templateEvent(field: string, value: unknown): Promise<void> {
        const v = (value ?? {}) as Record<string, unknown>;
        const name = text(v.message_template_name);
        if (!this.template || name !== this.template) return;

        if (field === "message_template_components_update") {
            this.logger.warn(
                `account_phone_whatsapp_template template=${name} change=components`,
            );
            return;
        }
        const [kind, state, bad] =
            field === "message_template_status_update"
                ? ["status", text(v.event), TEMPLATE_BAD.has(text(v.event))]
                : field === "message_template_quality_update"
                  ? [
                        "quality",
                        text(v.new_quality_score),
                        text(v.new_quality_score) === "RED",
                    ]
                  : ["", "", false];
        if (!kind || !/^[A-Z_]{1,40}$/.test(state)) return;
        const before = await this.store.swap(
            `${KEY}:template:${name}:${kind}`,
            state,
            30 * DAY_MS,
        );
        if (before === state) return;
        if (!bad) {
            this.logger.log(
                `account_phone_whatsapp_template template=${name} ${kind}=${state}`,
            );
            return;
        }
        const reason = /^[A-Z_]{1,40}$/.test(text(v.reason))
            ? ` reason=${text(v.reason)}`
            : "";
        this.logger.error(
            `account_phone_whatsapp_template template=${name} ${kind}=${state}${reason}: WhatsApp sign-in codes will fail`,
        );
        this.alert(Date.now(), {
            subject: `Saroh: the WhatsApp sign-in template is ${kind === "quality" ? "rated RED" : state.toLowerCase()}`,
            lines: [
                `Meta says the sign-in template ${name} is now ${kind === "quality" ? "of RED quality" : state}${reason ? ` (${text(v.reason)})` : ""}.`,
                kind === "quality"
                    ? "A RED template is paused next; WhatsApp sign-in codes then stop."
                    : "WhatsApp sign-in codes fail until it is fixed. People can still get their code by SMS.",
                "Check the template in Meta's WhatsApp Manager.",
            ],
        });
    }

    /** Sends and failures in the last hour (the last four 15-minute windows). */
    async lastHour(now = Date.now()): Promise<SignInHealthSummary> {
        let sends = 0;
        let failures = 0;
        for (let i = 0; i < 4; i++) {
            const counts = await this.store.hgetall(
                window(now - i * WINDOW_MS),
            );
            sends += Number(counts.sent) || 0;
            failures += Number(counts.failed) || 0;
        }
        return {
            sends,
            failures,
            lastError: await this.store.get(`${KEY}:last-error`),
            failing: isFailing(sends, failures, this.min, this.percent),
        };
    }

    private alert(now: number, alert: Omit<OwnerAlert, "path">): void {
        void this.alerts.send({ ...alert, path: "/health" }, new Date(now));
    }
}

function window(now: number): string {
    return `${KEY}:w:${Math.floor(now / WINDOW_MS)}`;
}

function reasonsOf(counts: Record<string, string>): Record<string, number> {
    return Object.fromEntries(
        Object.entries(counts)
            .filter(([field]) => field.startsWith("reason:"))
            .map(([field, n]) => [field.slice("reason:".length), Number(n)]),
    );
}

function text(value: unknown): string {
    return typeof value === "string" ? value : "";
}
