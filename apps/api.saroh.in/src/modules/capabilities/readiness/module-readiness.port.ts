/**
 * Module readiness + safe-deactivation port (ADR-003 / #114, plan Task 4).
 *
 * Readiness (SETUP_REQUIRED / ACTIVE / ATTENTION_REQUIRED) is DERIVED, never
 * persisted. Each module supplies an adapter that answers two questions with
 * cheap count/existence queries (never by loading whole datasets):
 *
 *   1. Is this enabled module actually ready to use? (readiness + blockers)
 *   2. Can it be safely disabled right now? (deactivation blockers)
 *
 * Adapters MUST return stable machine codes and safe, plain-language messages —
 * never raw provider errors, secrets, or customer identifiers.
 */
import type { OrgAction } from "../../organizations/organization-actions";
import type { ModuleKey, ModuleReadiness } from "../module-registry";

/** A reason a module is not fully ACTIVE. */
export interface ReadinessBlocker {
    /** Stable machine code, e.g. "WEBSITE_NO_PUBLICATION". */
    code: string;
    /** Safe, plain-language explanation. Never a raw provider error. */
    message: string;
    /** SETUP → user must finish configuration; ATTENTION → a dependency is unhealthy. */
    severity: "SETUP" | "ATTENTION";
    /** Optional deep-link to where the user resolves it. */
    actionHref?: string;
}

/** A reason a module cannot be fully disabled without abandoning obligations. */
export interface DeactivationBlocker {
    code: string;
    message: string;
    actionHref?: string;
}

/** The derived readiness of one enabled module. */
export interface ReadinessResult {
    readiness: ModuleReadiness;
    blockers: ReadinessBlocker[];
}

/** Scope for a readiness/deactivation evaluation. */
export interface ReadinessInput {
    organizationId: string;
    projectId?: string;
    /**
     * Whether the viewer may read with this action. A blocker or an impact
     * line that counts something says its number only to someone who may
     * read what it counts (F13). Absent — a system caller — counts as yes.
     */
    may?: (action: OrgAction) => boolean;
}

/**
 * One consequence of turning a module off, said before it happens (F13,
 * default 56): what it counts, what stops and what stays. Counts are real,
 * read at the moment of asking; a count that could not be read is `null`
 * and its sentence says so, never zero. A line that counts nothing (a tab
 * leaving the customer's account) has no `count` at all.
 */
export interface DeactivationImpactItem {
    /** Stable machine code, e.g. "APPOINTMENTS_UPCOMING_BOOKINGS". */
    code: string;
    /** The module the line belongs to: the one turned off, or one going with it. */
    moduleKey: ModuleKey;
    /** The number counted; null when the read failed; absent when nothing is counted. */
    count?: number | null;
    /** One or two plain sentences: the count, what stops and what stays. */
    message: string;
}

/** One module's readiness + safe-deactivation adapter. */
export interface ModuleReadinessAdapter {
    readonly key: ModuleKey;
    /** Derive readiness for an ENABLED module. */
    evaluate(input: ReadinessInput): Promise<ReadinessResult>;
    /**
     * Blockers that must be cleared before the module can be fully disabled.
     * Empty means safe to disable (it will still stop new activity while
     * preserving history). Never deletes data.
     */
    deactivationBlockers(input: ReadinessInput): Promise<DeactivationBlocker[]>;
}
