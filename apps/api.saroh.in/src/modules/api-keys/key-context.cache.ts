import type { ApiKey } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";

/** A key and the context it acts with: scope ∩ its creator's live actions. */
export interface KeyContext {
    key: ApiKey;
    context: OrganizationContext;
}

/** How long a key's context is reused before the key and creator are read again. */
export const KEY_CONTEXT_TTL_MS = 5_000;

/**
 * A few seconds of memory for each presented key (plan 2026-11-10-001,
 * Key Technical Decisions), so a storefront page's preflight and reads don't
 * each look up the key and resolve its creator.
 *
 * - Keyed by the token's digest, never the token.
 * - A miss or a failure is never kept: an unknown token, or a creator who
 *   left, is asked about again on the next call.
 * - `forgetOrganization` drops a business's keys at once; key, membership
 *   and role changes call it, so a revoke or a demotion bites on the next
 *   call on this replica. Other replicas catch up within the TTL.
 * - Bounded: past `maxKeys` the oldest goes.
 *
 * shortcut: per process, not Redis-shared as the plan sketches; move to
 * Redis if replicas grow and the TTL's staleness across them matters.
 */
export class KeyContextCache {
    private readonly kept = new Map<
        string,
        { value: KeyContext; at: number }
    >();

    constructor(
        readonly ttlMs = KEY_CONTEXT_TTL_MS,
        private readonly maxKeys = 10_000,
    ) {}

    async get(
        digest: string,
        load: () => Promise<KeyContext | null>,
        now: number = Date.now(),
    ): Promise<KeyContext | null> {
        const hit = this.kept.get(digest);
        if (hit && now >= hit.at && now - hit.at < this.ttlMs) return hit.value;
        this.kept.delete(digest);
        const value = await load();
        if (value) {
            this.kept.set(digest, { value, at: now });
            while (this.kept.size > this.maxKeys) {
                const oldest = this.kept.keys().next().value;
                if (oldest === undefined) break;
                this.kept.delete(oldest);
            }
        }
        return value;
    }

    /** Forget every key of a business: its keys, people or roles changed. */
    forgetOrganization(organizationId: string): void {
        for (const [digest, { value }] of this.kept) {
            if (value.key.organizationId === organizationId) {
                this.kept.delete(digest);
            }
        }
    }

    clear(): void {
        this.kept.clear();
    }
}

/** The one cache the guard reads and the services clear. */
export const keyContextCache = new KeyContextCache();
