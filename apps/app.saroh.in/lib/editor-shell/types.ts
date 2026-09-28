/**
 * The editor shell's contract with a record type (D6, DEC-043).
 *
 * A plan (D5 → D7) and a pack (E14 → E18) are edited on the same shell. Each
 * gives it an adapter: the server actions that load, autosave, publish,
 * discard and delete one record, all answering in the shapes below. The
 * shell never knows which record it holds; it knows the record's status, its
 * revision and whether a live one carries unpublished changes.
 */

/** A record's status on the server. DRAFT is never sold (DEC-043, D21). */
export type RecordStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";

/**
 * One record as the editor reads it. `values` is what the editor shows: for
 * a draft, its columns; for a live record, the published values with any
 * pending changes laid over them (D5's "merge for editor reads").
 */
export interface EditorRecord<V> {
    id: string;
    status: RecordStatus;
    /** A live record holds a set of unpublished changes on the server. */
    hasPendingChanges: boolean;
    /** The draft revision every save, publish and discard carries (#285). */
    revision: number;
    values: V;
    /** What is live now, for "When you publish" and Discard; null for a draft. */
    published: V | null;
    /** A draft nobody has bought or joined, so Delete draft is allowed. */
    canDelete: boolean;
}

/**
 * Someone else saved after this editor loaded (a 409 on a stale revision).
 * Nothing was written; the editor stops saving and offers Reload.
 */
export interface EditorConflict {
    /** Who changed it, by name; null when the API did not say. */
    changedBy: string | null;
    /** When, as an ISO string; null when the API did not say. */
    changedAt: string | null;
    /** The revision the server holds now, when it said. */
    current: number | null;
}

/** A failed call. `field` puts the refusal beside the field it is about. */
export interface EditorFailure {
    ok: false;
    error: string;
    field?: string;
    conflict?: EditorConflict;
}

export type EditorResult<T> = { ok: true; data: T } | EditorFailure;

/**
 * What a record type gives the shell: its server actions. Each is a Server
 * Action from `lib/<domain>/actions.ts`, wrapped by the record's editor.
 */
export interface EditorAdapter<V> {
    /** The first save of a new record, which creates it as a DRAFT. */
    create: (values: V) => Promise<EditorResult<EditorRecord<V>>>;
    /**
     * Autosave. On a DRAFT it writes the record; on a live one it writes the
     * pending changes. A stale revision answers with `conflict`.
     */
    saveDraft: (
        id: string,
        values: V,
        revision: number,
    ) => Promise<EditorResult<EditorRecord<V>>>;
    /** Publish a draft, or publish a live record's changes. */
    publish: (
        id: string,
        revision: number,
    ) => Promise<EditorResult<EditorRecord<V>>>;
    /** Drop a live record's pending changes. */
    discard: (
        id: string,
        revision: number,
    ) => Promise<EditorResult<EditorRecord<V>>>;
    /** Delete a draft that was never published or sold. */
    remove: (id: string, revision: number) => Promise<EditorResult<null>>;
    /** Read it again, for Reload after a conflict. */
    load: (id: string) => Promise<EditorResult<EditorRecord<V>>>;
}

/**
 * The words that differ between record types. Everything else the shell
 * says ("Changes not live", "Unpublished changes · saved as a draft") is
 * the same for a plan and a pack, as the two designs draw it.
 */
export interface EditorCopy {
    /** "plan", "pack": in "Priya changed this plan". */
    noun: string;
    /** The pill for a live record: "Open" (plan), "On sale" (pack). */
    liveLabel: string;
    /** "Open to new sign-ups · no changes". */
    liveClean: string;
    /** A saved draft: "Draft · saved — nobody can join it yet". */
    draftSaved: string;
    /** Just created: "Saved as a draft — nobody can join it yet. Delete…". */
    draftFirstSaved: string;
    /** Nothing typed yet: "Not saved yet — start with a name". */
    notStarted: string;
    /** "View plan". */
    viewLabel: string;
}

/** A rule the record breaks, which stops Publish (and marks its field). */
export interface EditorProblem {
    field: string;
    message: string;
}
