import { ConflictException } from "@nestjs/common";

/**
 * Drafts on published records (round-2 D5, DEC-043): the rules a plan (D5)
 * and a class pack (E14) share. Pure: the record's own module reads and
 * writes its row under its lock, and calls these for what to write.
 *
 * A record is DRAFT (never sold, its columns written directly), or live with
 * an optional set of unpublished changes stored beside the published
 * columns, which buyers keep reading. The pending set holds only the fields
 * that differ from what is live, so dropping a change back to the live value
 * drops it from the set, and an empty set is none at all.
 *
 * Each record type lists its publishable fields itself (`fields` below)
 * rather than reading them off its DTO class: class-validator's metadata is
 * not a stable API, and a DTO field (the revision) is not a record field.
 */

/**
 * A value a draft field holds: money travels as "1500.00". A list (a pack's
 * services, E14) is a set of ids the record keeps sorted, so two lists are
 * the same value only when they hold the same ids in the same order.
 */
export type DraftValue = string | number | null | readonly string[];

/** Whether two field values are the same: lists by their items. */
export function sameValue(a: DraftValue, b: DraftValue): boolean {
    if (Array.isArray(a) || Array.isArray(b)) {
        if (!Array.isArray(a) || !Array.isArray(b)) return false;
        return a.length === b.length && a.every((v, i) => v === b[i]);
    }
    return a === b;
}

/** A stored value a field can hold: a string, a number, null or a string list. */
function isDraftValue(v: unknown): v is DraftValue {
    if (v === null || typeof v === "string" || typeof v === "number") {
        return true;
    }
    return Array.isArray(v) && v.every((x) => typeof x === "string");
}

/** A record's values: every field a {@link DraftValue}. */
export type DraftValues<V> = Record<keyof V, DraftValue>;

/** Some of a record's fields: a patch, or a pending set. */
export type DraftPatch<V extends DraftValues<V>> = Partial<V>;

/** `{ field: [before, after] }` for the fields that differ. */
export type DraftChanges<V extends DraftValues<V>> = Partial<
    Record<keyof V & string, [DraftValue, DraftValue]>
>;

/**
 * The fields of `patch` that are publishable, as sent. A field left out is
 * not in the result; a field sent as null is (it clears the value).
 */
export function pickPatch<V extends DraftValues<V>>(
    fields: readonly (keyof V & string)[],
    patch: Readonly<Record<string, unknown>>,
): DraftPatch<V> {
    const out: Record<string, unknown> = {};
    for (const field of fields) {
        if (patch[field] !== undefined) out[field] = patch[field];
    }
    return out as DraftPatch<V>;
}

/**
 * A stored pending set, read defensively: only the record's fields, only
 * values a field can hold. Null when there is nothing (or nothing usable).
 */
export function readPending<V extends DraftValues<V>>(
    fields: readonly (keyof V & string)[],
    stored: unknown,
): DraftPatch<V> | null {
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
        return null;
    }
    const raw = stored as Record<string, unknown>;
    const out: Record<string, DraftValue> = {};
    for (const field of fields) {
        if (!(field in raw)) continue;
        const v = raw[field];
        if (isDraftValue(v)) out[field] = v;
    }
    return Object.keys(out).length ? (out as DraftPatch<V>) : null;
}

/** What the editor shows: the live values with the pending set over them. */
export function mergeForEditor<V extends DraftValues<V>>(
    live: V,
    pending: DraftPatch<V> | null,
): V {
    return { ...live, ...(pending ?? {}) };
}

/**
 * The pending set after a save: the one held, with the patch laid over it,
 * less every field now equal to its live value. Null when nothing differs.
 */
export function nextPending<V extends DraftValues<V>>(
    fields: readonly (keyof V & string)[],
    live: V,
    pending: DraftPatch<V> | null,
    patch: DraftPatch<V>,
): DraftPatch<V> | null {
    const merged = { ...(pending ?? {}), ...patch };
    const out: Record<string, DraftValue> = {};
    for (const field of fields) {
        if (!(field in merged)) continue;
        const v = merged[field] as DraftValue;
        if (!sameValue(v, live[field])) out[field] = v;
    }
    return Object.keys(out).length ? (out as DraftPatch<V>) : null;
}

/** The fields that differ between two full sets of values. */
export function diffValues<V extends DraftValues<V>>(
    fields: readonly (keyof V & string)[],
    before: V,
    after: V,
): DraftChanges<V> {
    const out: DraftChanges<V> = {};
    for (const field of fields) {
        if (!sameValue(before[field], after[field])) {
            out[field] = [before[field], after[field]];
        }
    }
    return out;
}

/** Whether two pending sets hold the same changes (null is none). */
export function samePending<V extends DraftValues<V>>(
    a: DraftPatch<V> | null,
    b: DraftPatch<V> | null,
): boolean {
    const ka = Object.keys(a ?? {});
    const kb = Object.keys(b ?? {});
    if (ka.length !== kb.length) return false;
    const av = (a ?? {}) as Record<string, DraftValue>;
    const bv = (b ?? {}) as Record<string, DraftValue>;
    return ka.every((k) => k in bv && sameValue(av[k], bv[k]));
}

/** The last save to a record's draft state, for a stale editor's 409. */
export interface DraftRevisionState {
    /** The revision the server holds. */
    revision: number;
    /** Who saved it, by display name; null when unknown or not shown. */
    changedBy: string | null;
    changedAt: Date | null;
}

/**
 * Refuse a write from an editor holding an older revision (the site draft's
 * rule, #285). Nothing is written. The 409's details are what the editor
 * shell reads as a conflict (`apps/app.saroh.in/lib/editor-shell/result.ts`):
 * `{ yours, current, changedBy, changedAt }`, with `changedBy` a display
 * name, never an id. No other refusal carries these keys.
 */
export function assertRevision(
    yours: number,
    held: DraftRevisionState,
    noun: string,
): void {
    if (yours === held.revision) return;
    // A blank name is no name.
    const who =
        held.changedBy && held.changedBy.trim().length > 0
            ? held.changedBy.trim()
            : "Someone else";
    throw new ConflictException({
        message: `${who} changed this ${noun} while you were editing. Reload to see it.`,
        details: {
            yours,
            current: held.revision,
            changedBy: held.changedBy,
            changedAt: held.changedAt?.toISOString() ?? null,
        },
    });
}
