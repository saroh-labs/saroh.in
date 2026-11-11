import type { OnModuleDestroy } from "@nestjs/common";
import { HttpException, HttpStatus, Logger } from "@nestjs/common";
import type { ErrorCode } from "@saroh/api-contract";
import type { Response } from "express";
import type Redis from "ioredis";

import type { LimitScope } from "./caps";
import type { LimitDecision } from "./memory-window";
import { gcraUsed, MemoryWindow } from "./memory-window";
import { redisTake } from "./redis-window";

/** At most one `rate_limit_open` WARN a minute; the rest are counted into it. */
const WARN_EVERY_MS = 60_000;

/**
 * Durable rate limits for the public API and MCP (plan 2026-11-10-001, U4).
 * Primary: a GCRA window in Redis shared by every replica. On any Redis
 * error, or with no Redis, it fails open to an in-process window at the cap
 * divided by the replica count, so a limit still holds roughly.
 *
 * Degraded path: `rate_limit_open` (WARN) — Redis refused or timed out and
 * this replica limited in process. At most one line a minute, carrying how
 * many calls fell back since the last; any steady stream means Redis is down
 * or unreachable from this replica and limits are per replica until it's back.
 * `reason=recovered calls=N` marks the first call Redis answered again.
 */
export class LimitsService implements OnModuleDestroy {
    private readonly logger = new Logger(LimitsService.name);
    private readonly memory = new MemoryWindow();
    private lastWarnAt = Number.NEGATIVE_INFINITY;
    private unwarned = 0;
    /** Whether the last Redis call failed: the next success says so. */
    private open = false;
    /** Calls that fell back to the in-process window since boot. */
    openCount = 0;

    constructor(
        private readonly redis: Pick<Redis, "eval" | "quit"> | null,
        private readonly replicas = 1,
    ) {
        if (!redis) {
            this.logger.warn(
                "rate_limit_open reason=no_redis: limiting in process on each replica",
            );
        }
    }

    async take(
        scope: LimitScope,
        id: string,
        cap: number,
        now: number = Date.now(),
    ): Promise<LimitDecision> {
        const key = `rl:${scope}:${id}`;
        if (this.redis) {
            try {
                const decision = await redisTake(this.redis, key, cap, now);
                if (this.open) this.closed();
                return decision;
            } catch (error) {
                this.opened(error, now);
            }
        }
        const share =
            cap <= 0 ? 0 : Math.max(1, Math.floor(cap / this.replicas));
        return this.memory.take(key, share, now);
    }

    /**
     * How many calls the window holds now, taking none (Usage, U14). Read
     * from Redis, or from this replica's window when Redis fails, where it
     * counts this replica's share only.
     */
    async used(
        scope: LimitScope,
        id: string,
        cap: number,
        now: number = Date.now(),
    ): Promise<number> {
        const key = `rl:${scope}:${id}`;
        if (this.redis) {
            try {
                const stored = (await this.redis.eval(
                    "return redis.call('GET', KEYS[1])",
                    1,
                    key,
                )) as string | null;
                return gcraUsed(stored ? Number(stored) : null, now, cap);
            } catch (error) {
                this.opened(error, now);
            }
        }
        const share =
            cap <= 0 ? 0 : Math.max(1, Math.floor(cap / this.replicas));
        return this.memory.used(key, share, now);
    }

    /**
     * Takes one call and says so in `RateLimit-*` headers; over the cap,
     * throws a 429 in the public contract's shape with `Retry-After`.
     */
    async enforce(
        res: Pick<Response, "setHeader">,
        scope: LimitScope,
        id: string,
        cap: number,
        now: number = Date.now(),
    ): Promise<LimitDecision> {
        const decision = await this.take(scope, id, cap, now);
        const wait = Math.max(0, Math.ceil((decision.resetAt - now) / 1000));
        res.setHeader("RateLimit-Limit", String(cap));
        res.setHeader("RateLimit-Remaining", String(decision.remaining));
        res.setHeader("RateLimit-Reset", String(wait));
        if (!decision.allowed) {
            res.setHeader("Retry-After", String(Math.max(1, wait)));
            throw new HttpException(
                {
                    error: {
                        code: "rate_limited" satisfies ErrorCode,
                        message: `Too many requests. Try again in ${Math.max(1, wait)} seconds.`,
                    },
                },
                HttpStatus.TOO_MANY_REQUESTS,
            );
        }
        return decision;
    }

    async onModuleDestroy(): Promise<void> {
        await this.redis?.quit().catch(() => undefined);
    }

    /**
     * Redis answered again: the calls that fell back since the last WARN,
     * which no later WARN would carry (an outage shorter than a minute
     * otherwise logs only its first call).
     */
    private closed(): void {
        this.logger.warn(
            `rate_limit_open reason=recovered calls=${this.unwarned}`,
        );
        this.unwarned = 0;
        this.open = false;
        this.lastWarnAt = Number.NEGATIVE_INFINITY;
    }

    private opened(error: unknown, now: number): void {
        this.open = true;
        this.openCount += 1;
        this.unwarned += 1;
        if (now - this.lastWarnAt < WARN_EVERY_MS) return;
        const reason = error instanceof Error ? error.message : String(error);
        this.logger.warn(
            `rate_limit_open reason=redis_error calls=${this.unwarned} error=${reason}`,
        );
        this.lastWarnAt = now;
        this.unwarned = 0;
    }
}
