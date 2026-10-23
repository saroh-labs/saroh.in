/**
 * The rules of the one setup checklist (UX audit, 10 Oct), pure so they are
 * tested without a screen: how it counts, the order of its rows, and what
 * it draws once every step is done.
 *
 * There were four checklists in four styles: Home, Settings › Business, a
 * location and the website's share list. One wrote "1 of 4 done" and
 * another "2 of 4", one struck done steps through and another hid them, one
 * vanished at 100% and another folded. `SetupChecklist`
 * (`components/shared/setup-checklist/setup-checklist.tsx`) draws all four from this file.
 */

/** One step of a checklist. */
export interface ChecklistRow {
    key: string;
    /** The step, as a thing to do ("Add your address"). */
    label: string;
    done: boolean;
    /** Why it matters, in a sentence. Shown while it is left to do. */
    why?: string;
    /** What is in use, on a done step ("using Rye"). */
    note?: string;
    /** Something that worked has stopped. */
    broken?: boolean;
    /**
     * The ONE thing that does it, opened in place where it can be: a link
     * (the `?edit=` deep links open a row's sheet) or a press on this page.
     * Absent on a step nobody here can do.
     */
    action?: ChecklistAction;
    /** Where a done step can be seen: the live shop, in a new tab. */
    view?: { label: string; href: string };
}

export interface ChecklistAction {
    label: string;
    href?: string;
    onPress?: () => void;
}

/** Done first (what is already behind the owner), then what is left. */
export function orderRows<T extends Pick<ChecklistRow, "done">>(
    rows: readonly T[],
): T[] {
    return [...rows.filter((r) => r.done), ...rows.filter((r) => !r.done)];
}

export function countRows(rows: readonly Pick<ChecklistRow, "done">[]): {
    done: number;
    total: number;
    finished: boolean;
} {
    const done = rows.filter((r) => r.done).length;
    return { done, total: rows.length, finished: done === rows.length };
}

/**
 * What a finished checklist draws.
 *
 * - `finished`: the whole card, every row ticked and the bar full, under
 *   the heading that says the true thing ("You're ready to take money.").
 *   Shown on the visit the last step was done, so the tick is seen landing
 *   and the card doesn't vanish in the same render.
 * - `folded`: one quiet line, on the next visit.
 * - `gone`: nothing, from the visit after that, where the line would only
 *   be clutter (`fold: "once"`, Home).
 */
export type FinishedView = "finished" | "folded" | "gone";

/**
 * What this browser last saw of a checklist:
 *
 * - `null`: nothing. A business that finished long ago, or a new browser.
 * - `"open"`: steps were left.
 * - `1`: the finished card.
 * - `2`: the quiet line.
 */
export type FoldStage = null | "open" | 1 | 2;

export function finishedView(
    stage: FoldStage,
    fold: "keep" | "once",
): FinishedView {
    // Last seen with steps left: this is the visit that finds it done.
    if (stage === "open") return "finished";
    if (stage === 1) return "folded";
    // Seen the line already, or never seen at all: nothing to announce.
    return fold === "once" ? "gone" : "folded";
}

/**
 * Before the browser has said which visit this is (the server's render):
 * the quiet line where it stays for good, nothing where it goes away, so a
 * settled page never flashes a card that then leaves.
 */
export function unreadView(fold: "keep" | "once"): FinishedView {
    return fold === "once" ? "gone" : "folded";
}

/**
 * Which visit this is, kept in the browser per checklist: a convenience,
 * never a setting. Storage can be missing or refuse (a private window), so
 * every read and write is guarded, and a failed read is "never seen".
 */
export const FOLD_KEY = "saroh.setup.finished";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function readMap(storage: () => StorageLike): Record<string, unknown> {
    try {
        const raw: unknown = JSON.parse(storage().getItem(FOLD_KEY) ?? "{}");
        return raw && typeof raw === "object" && !Array.isArray(raw)
            ? (raw as Record<string, unknown>)
            : {};
    } catch {
        return {};
    }
}

export function readFoldStage(
    storage: () => StorageLike,
    key: string,
): FoldStage {
    const stage = readMap(storage)[key];
    return stage === "open" || stage === 1 || stage === 2 ? stage : null;
}

export function writeFoldStage(
    storage: () => StorageLike,
    key: string,
    stage: FoldStage,
): boolean {
    try {
        const next = { ...readMap(storage) };
        if (stage === null) delete next[key];
        else next[key] = stage;
        storage().setItem(FOLD_KEY, JSON.stringify(next));
        return true;
    } catch {
        return false;
    }
}

/** What a visit that finds it finished leaves for the next one. */
export function nextFoldStage(stage: FoldStage): FoldStage {
    return stage === "open" ? 1 : 2;
}
