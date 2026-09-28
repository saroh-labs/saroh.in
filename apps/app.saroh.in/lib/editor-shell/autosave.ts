import type { SaveEvent, SaveState } from "./state";
import { initialSave, isSettled, saveReducer, wantsSave } from "./state";
import type { EditorConflict, EditorResult } from "./types";

/**
 * About 800 ms after the last keystroke (D6). Blur and leaving flush sooner.
 */
export const AUTOSAVE_DELAY_MS = 800;

export interface AutosaveOptions<V> {
    /** The values the editor opened with, as the server has them. */
    values: V;
    revision: number | null;
    onState: (state: SaveState) => void;
    delayMs?: number;
    /** Injected in tests; the browser's timers otherwise. */
    timers?: {
        set: (fn: () => void, ms: number) => unknown;
        clear: (handle: unknown) => void;
    };
}

/** What a save calls. Given at `connect`, once the editor has mounted. */
export interface AutosaveLink<V, R extends { revision: number }> {
    /** Sends one save: create the record, or save its draft. */
    send: (values: V, revision: number | null) => Promise<EditorResult<R>>;
    /** Whether the values are enough to save at all (a new record needs a name). */
    ready: (values: V) => boolean;
    /** A save the server accepted, with what it answered. */
    onSaved?: (record: R, values: V) => void;
}

/**
 * Autosave without React, so its rules are tested on their own.
 *
 * One save is out at a time. An edit made while one is out waits for it,
 * then goes with the next save; so answers can't arrive out of order, and
 * the state machine still refuses to let a late, older answer say "Saved".
 * A failure stops the loop until the next edit or Try again. A conflict
 * stops it until the screen takes the server's copy (`reset`).
 */
export class Autosave<V, R extends { revision: number }> {
    private state: SaveState;
    private latest: V;
    private saved: V;
    private timer: unknown = null;
    private inFlight: Promise<void> | null = null;
    private disposed = false;
    private link: AutosaveLink<V, R> | null = null;
    private readonly delay: number;
    private readonly timers: NonNullable<AutosaveOptions<V>["timers"]>;

    constructor(
        private readonly opts: AutosaveOptions<V>,
        link?: AutosaveLink<V, R>,
    ) {
        this.link = link ?? null;
        this.state = initialSave(opts.revision);
        this.latest = opts.values;
        this.saved = opts.values;
        this.delay = opts.delayMs ?? AUTOSAVE_DELAY_MS;
        this.timers = opts.timers ?? {
            set: (fn, ms) => setTimeout(fn, ms),
            clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
        };
    }

    get snapshot(): SaveState {
        return this.state;
    }

    /** What the server last accepted, to name the fields that aren't saved. */
    get lastSaved(): V {
        return this.saved;
    }

    get values(): V {
        return this.latest;
    }

    private dispatch(e: SaveEvent) {
        const next = saveReducer(this.state, e);
        if (next === this.state) return;
        this.state = next;
        if (!this.disposed) this.opts.onState(next);
    }

    /** The screen changed. Saves after the pause, unless in a conflict. */
    edit(values: V) {
        this.latest = values;
        this.dispatch({ type: "edit" });
        this.arm();
    }

    private arm() {
        this.cancelTimer();
        if (this.disposed || !wantsSave(this.state)) return;
        this.timer = this.timers.set(() => {
            this.timer = null;
            void this.sendOnce();
        }, this.delay);
    }

    private cancelTimer() {
        if (this.timer !== null) {
            this.timers.clear(this.timer);
            this.timer = null;
        }
    }

    /** Sends what is on screen, if a save is wanted and none is out. */
    private sendOnce(): Promise<void> {
        if (this.inFlight) return this.inFlight;
        const link = this.link;
        if (!link || !wantsSave(this.state) || !link.ready(this.latest)) {
            return Promise.resolve();
        }
        const seq = this.state.edits;
        const values = this.latest;
        this.dispatch({ type: "send", seq });
        const run = link
            .send(values, this.state.revision)
            .catch((): EditorResult<R> => ({
                ok: false,
                error: "Couldn't reach Saroh — your changes are still here.",
            }))
            .then((res) => {
                if (res.ok) {
                    this.dispatch({
                        type: "saved",
                        seq,
                        revision: res.data.revision,
                    });
                    // Unless a Reload or Publish replaced the screen while
                    // this was out: then the answer is about values gone.
                    if (this.state.savedSeq !== seq) return;
                    this.saved = values;
                    if (!this.disposed) link.onSaved?.(res.data, values);
                } else if (res.conflict) {
                    this.dispatch({ type: "conflict", conflict: res.conflict });
                } else {
                    this.dispatch({
                        type: "failed",
                        seq,
                        error: res.error,
                        field: res.field,
                    });
                }
            })
            .finally(() => {
                this.inFlight = null;
                // Edits made while this was out go with the next save.
                this.arm();
            });
        this.inFlight = run;
        return run;
    }

    /**
     * Save now (blur, leaving, before Publish). True when what is on screen
     * is on the server afterwards. A failed save isn't retried here: Try
     * again or the next edit does that.
     */
    async flush(): Promise<boolean> {
        this.cancelTimer();
        // Each pass either waits on the save that is out or sends one; the
        // loop ends once nothing is wanted.
        for (let i = 0; i < 10; i++) {
            if (this.inFlight) {
                await this.inFlight;
                this.cancelTimer();
                continue;
            }
            if (
                this.link &&
                wantsSave(this.state) &&
                this.link.ready(this.latest)
            ) {
                await this.sendOnce();
                this.cancelTimer();
                continue;
            }
            break;
        }
        return isSettled(this.state);
    }

    /** Try again after a failed save. */
    retry(): Promise<boolean> {
        this.dispatch({ type: "retry" });
        return this.flush();
    }

    /** A publish or discard answered 409: stop saving, as an autosave's does. */
    conflict(conflict: EditorConflict) {
        this.cancelTimer();
        this.dispatch({ type: "conflict", conflict });
    }

    /** The server's copy replaces the screen's: Reload, Publish, Discard. */
    reset(values: V, revision: number) {
        this.cancelTimer();
        this.latest = values;
        this.saved = values;
        this.dispatch({ type: "reset", revision });
    }

    /**
     * Stop sending, and wait for a save already out (before Discard or
     * Delete draft, which a late autosave would otherwise undo).
     */
    async idle(): Promise<void> {
        this.cancelTimer();
        if (this.inFlight) await this.inFlight;
        this.cancelTimer();
    }

    /** The editor closed: no more timers, and no more reports. */
    dispose() {
        this.disposed = true;
        this.cancelTimer();
    }

    /** The editor mounted (again, in React's development double mount). */
    connect(link: AutosaveLink<V, R>) {
        this.link = link;
        this.disposed = false;
        this.arm();
    }
}
