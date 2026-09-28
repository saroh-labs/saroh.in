import type {
    EditorConflict,
    EditorCopy,
    EditorProblem,
    RecordStatus,
} from "./types";

/*
 * The editor shell's rules, pure (D6). Two things are tracked apart:
 *
 * - the SAVE state — whether what is on screen has reached the server:
 *   idle → dirty → saving → saved | failed | conflict;
 * - the RECORD's publish state — Draft, Live, or Live with unpublished
 *   changes — which only the server's answer moves.
 *
 * The header's pill, its status line, which actions show, and why Publish
 * is off are each a function of the two.
 */

export type SavePhase =
    "idle" | "dirty" | "saving" | "saved" | "failed" | "conflict";

/**
 * Every edit takes the next sequence number, and every save carries the
 * number of the edit it sent. That is how an answer that arrives late — an
 * older payload succeeding after a newer one failed — is kept from saying
 * "Saved" over work that isn't.
 */
export interface SaveState {
    phase: SavePhase;
    /** The latest edit's number; 0 before any. */
    edits: number;
    /** The newest edit the server has accepted. */
    savedSeq: number;
    /** The edit a request is out for, while one is. */
    sending: number | null;
    /** The edit whose save failed, until a newer one saves. */
    failedSeq: number | null;
    /** The revision the next save carries; null before the record exists. */
    revision: number | null;
    conflict: EditorConflict | null;
    /** The failed save's message, for the toast and the field. */
    error: string | null;
    errorField: string | null;
}

export type SaveEvent =
    | { type: "edit" }
    | { type: "send"; seq: number }
    | { type: "saved"; seq: number; revision: number }
    | {
          type: "failed";
          seq: number;
          error: string;
          field?: string;
      }
    | { type: "conflict"; conflict: EditorConflict }
    | { type: "retry" }
    /** The server's copy replaced the screen's: Reload, Publish, Discard. */
    | { type: "reset"; revision: number };

export function initialSave(revision: number | null): SaveState {
    return {
        phase: "idle",
        edits: 0,
        savedSeq: 0,
        sending: null,
        failedSeq: null,
        revision,
        conflict: null,
        error: null,
        errorField: null,
    };
}

export function saveReducer(s: SaveState, e: SaveEvent): SaveState {
    switch (e.type) {
        case "edit": {
            const edits = s.edits + 1;
            // In a conflict the typed values stay on screen, and nothing is
            // sent until Reload: every save would carry the stale revision.
            if (s.phase === "conflict") return { ...s, edits };
            return {
                ...s,
                edits,
                phase: s.sending !== null ? "saving" : "dirty",
            };
        }
        case "send":
            if (s.phase === "conflict") return s;
            return { ...s, sending: e.seq, phase: "saving" };
        case "saved": {
            // An answer older than one already settled changes nothing.
            if (e.seq < s.savedSeq) return s;
            const sending = s.sending === e.seq ? null : s.sending;
            const revision = Math.max(s.revision ?? 0, e.revision);
            if (s.phase === "conflict") return { ...s, sending, revision };
            const savedSeq = e.seq;
            // A newer edit failed: this older payload succeeding does not
            // make what is on screen saved.
            if (s.failedSeq !== null && s.failedSeq > e.seq) {
                return { ...s, sending, revision, savedSeq, phase: "failed" };
            }
            return {
                ...s,
                sending,
                revision,
                savedSeq,
                failedSeq: null,
                error: null,
                errorField: null,
                phase:
                    sending !== null
                        ? "saving"
                        : savedSeq >= s.edits
                          ? "saved"
                          : "dirty",
            };
        }
        case "failed": {
            if (e.seq < s.savedSeq) return s;
            const sending = s.sending === e.seq ? null : s.sending;
            if (s.phase === "conflict") return { ...s, sending };
            return {
                ...s,
                sending,
                phase: "failed",
                failedSeq: Math.max(s.failedSeq ?? 0, e.seq),
                error: e.error,
                errorField: e.field ?? null,
            };
        }
        case "conflict":
            return {
                ...s,
                sending: null,
                phase: "conflict",
                conflict: e.conflict,
                error: null,
                errorField: null,
            };
        case "retry":
            if (s.phase !== "failed") return s;
            return { ...s, phase: "dirty" };
        case "reset":
            return {
                ...initialSave(e.revision),
                // Numbers keep counting past the reset, so an answer still in
                // flight from before it is older than anything after it.
                edits: s.edits + 1,
                savedSeq: s.edits + 1,
                phase: "idle",
            };
    }
}

/** Whether an autosave should go out now (edits waiting, nothing blocking). */
export function wantsSave(s: SaveState): boolean {
    return s.phase === "dirty" && s.sending === null && s.edits > s.savedSeq;
}

/** What is on screen is what the server has: leaving asks nothing. */
export function isSettled(s: SaveState): boolean {
    return (
        s.sending === null &&
        s.edits <= s.savedSeq &&
        s.phase !== "failed" &&
        s.phase !== "conflict"
    );
}

// ---------------------------------------------------------------------------
// The record's publish state, and what the header says about it
// ---------------------------------------------------------------------------

export type PublishState = "new" | "draft" | "live" | "changes";

export interface RecordFacts {
    status: RecordStatus;
    hasPendingChanges: boolean;
    canDelete: boolean;
}

export function publishState(record: RecordFacts | null): PublishState {
    if (!record) return "new";
    if (record.status === "DRAFT") return "draft";
    return record.hasPendingChanges ? "changes" : "live";
}

export type ShellTone = "ok" | "accent" | "off";

/** The pill beside the title: a fact about what customers can see. */
export function statePill(
    record: RecordFacts | null,
    copy: Pick<EditorCopy, "liveLabel">,
): { label: string; tone: ShellTone } {
    const p = publishState(record);
    if (p === "new" || p === "draft") return { label: "Draft", tone: "off" };
    if (p === "changes") return { label: "Changes not live", tone: "accent" };
    if (record?.status === "ARCHIVED")
        return { label: "Archived", tone: "off" };
    return { label: copy.liveLabel, tone: "ok" };
}

export interface StatusLine {
    text: string;
    tone: "quiet" | "danger";
    /** A button beside the words: Try again after a failure, Reload after a conflict. */
    action: "retry" | "reload" | null;
}

/** "Priya changed this plan", or "Someone else…" when the API did not say who. */
export function conflictText(c: EditorConflict | null, noun: string): string {
    const name = c?.changedBy?.trim() ?? "";
    const who = name.length > 0 ? name : "Someone else";
    return `${who} changed this ${noun}`;
}

/**
 * The line under the title. It never says "saved" unless the server has
 * everything on screen: a failure says "Not saved", a conflict names who.
 */
export function statusLine(input: {
    save: SaveState;
    record: RecordFacts | null;
    copy: EditorCopy;
    /** Why a save can't go yet ("Add a name to save the draft"); null when it can. */
    blocker: string | null;
    /** The record was created in this visit, and hasn't been published. */
    firstSave: boolean;
}): StatusLine {
    const { save, record, copy, blocker, firstSave } = input;
    const quiet = (text: string): StatusLine => ({
        text,
        tone: "quiet",
        action: null,
    });
    if (save.phase === "conflict") {
        return {
            text: `${conflictText(save.conflict, copy.noun)} — reload to see it. Your edits here aren't saved.`,
            tone: "danger",
            action: "reload",
        };
    }
    if (save.phase === "failed") {
        return {
            text: "Not saved — your changes are still here.",
            tone: "danger",
            action: "retry",
        };
    }
    const waiting = save.edits > save.savedSeq || save.sending !== null;
    if (waiting && blocker && save.sending === null) {
        return { text: blocker, tone: "danger", action: null };
    }
    if (waiting) return quiet("Saving…");
    const p = publishState(record);
    if (p === "new") return quiet(copy.notStarted);
    if (p === "draft") {
        return quiet(firstSave ? copy.draftFirstSaved : copy.draftSaved);
    }
    if (p === "changes") return quiet("Unpublished changes · saved as a draft");
    if (record?.status === "ARCHIVED") return quiet("Archived · no changes");
    return quiet(copy.liveClean);
}

export interface ShellActions {
    publishLabel: "Publish" | "Publish changes";
    publishOn: boolean;
    /** Why Publish is off, in words; null when it is on or needs no reason. */
    publishWhy: string | null;
    discard: boolean;
    deleteDraft: boolean;
    view: boolean;
}

/**
 * Which actions the header offers. Draft → Publish · Delete draft. Live with
 * changes → Publish changes · Discard changes. Live → Publish changes, off,
 * with the reason (the design draws it disabled rather than hiding it).
 */
export function shellActions(input: {
    save: SaveState;
    record: RecordFacts | null;
    problems: EditorProblem[];
    /** Busy with a publish, discard or delete. */
    busy: boolean;
}): ShellActions {
    const { save, record, problems, busy } = input;
    const p = publishState(record);
    const live = p === "live" || p === "changes";
    const typed = save.edits > 0;
    const unsaved = save.edits > save.savedSeq || save.sending !== null;
    let why: string | null = null;
    if (save.phase === "conflict") {
        why = "Reload to see their changes before you publish.";
    } else if (save.phase === "failed") {
        why = "Your last change isn't saved — try again before you publish.";
    } else if (problems.length > 0) {
        // Not before anything is typed: a new, empty record isn't wrong yet.
        if (record || typed) {
            why =
                problems.length === 1
                    ? `1 thing to fix before publishing — ${lowerFirst(problems[0].message)}.`
                    : `${problems.length} things to fix before publishing — they're marked below.`;
        }
    } else if (p === "live" && !unsaved) {
        why = "Nothing to publish yet — edits appear here as a draft first.";
    }
    const blocked =
        save.phase === "conflict" ||
        save.phase === "failed" ||
        problems.length > 0 ||
        (p === "live" && !unsaved);
    return {
        publishLabel: live ? "Publish changes" : "Publish",
        publishOn: !blocked && !busy,
        publishWhy: why,
        discard: p === "changes",
        deleteDraft: p === "draft" && !!record?.canDelete,
        view: record !== null,
    };
}

function lowerFirst(s: string): string {
    return s ? s[0].toLowerCase() + s.slice(1) : s;
}

/** The field names whose values differ from what the server last accepted. */
export function unsavedFields<V extends Record<string, unknown>>(
    saved: V,
    current: V,
    labels: Partial<Record<keyof V & string, string>>,
): string[] {
    const out: string[] = [];
    for (const key of Object.keys(labels) as (keyof V & string)[]) {
        if (JSON.stringify(saved[key]) !== JSON.stringify(current[key])) {
            const label = labels[key];
            if (label && !out.includes(label)) out.push(label);
        }
    }
    return out;
}

/** "name", "name and price", "name, price and classes". */
export function joinAnd(items: string[]): string {
    if (items.length <= 1) return items[0] ?? "";
    return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** The leave dialog's words, naming what would be lost. */
export function leaveCopy(input: {
    save: SaveState;
    fields: string[];
    created: boolean;
    noun: string;
}): { title: string; body: string } {
    const { save, fields, created, noun } = input;
    const what = fields.length
        ? `Your changes to ${joinAnd(fields)} aren't saved`
        : "Your latest changes aren't saved";
    if (!created) {
        return {
            title: "Leave without saving it?",
            body: `Nothing you've entered is kept — the ${noun} saves as a draft once it has a name.`,
        };
    }
    if (save.phase === "conflict") {
        return {
            title: "Leave with unsaved changes?",
            body: `${conflictText(save.conflict, noun)}, so ${lowerFirst(what)} and will be lost.`,
        };
    }
    return {
        title: "Leave with unsaved changes?",
        body: `${what}, and will be lost if you leave now.`,
    };
}
