import type { OrderRow } from "./business-service";
import { STAGE_LABEL } from "./lifecycle";
import { rowCustomer } from "./list-row";
import type { KitchenStage } from "./read";
import { rowNext } from "./row-menu";

/**
 * Bulk kitchen moves on the Orders list (plan B, B6; the "Saroh Orders
 * Screen" design's bulk bar): what the selection can do, the hold's words,
 * and what a batch did, in words. Pure, so the rules are pinned by tests and
 * `bulk-bar.tsx` only draws them.
 *
 * The server holds the batch and commits it (`POST …/orders/stage/batches`);
 * the countdown is the shared ten-second hold (`lib/hold-undo.ts`), never a
 * timer of its own.
 */

/** One order's step, where the list saw it: what the API checks it against. */
export interface BulkLine {
    orderId: string;
    from: KitchenStage;
    to: KitchenStage;
}

export type BulkKind = "prepare" | "ready" | "handover";

export interface BulkAction {
    kind: BulkKind;
    /** "Mark ready (3)". */
    label: string;
    lines: BulkLine[];
    /** First names, in the order the list shows them. */
    names: string[];
    /** Ready is held ten seconds, with Send now and Undo all (the design). */
    hold: boolean;
    /** How many selected orders this action leaves alone. */
    skipped: number;
    /** Why it's off right now; null when it can be taken. */
    disabled: string | null;
    /** The button's hint. */
    title: string;
}

const LABEL: Record<BulkKind, string> = {
    prepare: "Start preparing",
    ready: "Mark ready",
    handover: "Mark collected / handed over",
};

/** What the orders this action leaves alone are not ("1 skipped: not New"). */
const NOT: Record<BulkKind, string> = {
    prepare: "not New",
    ready: "not preparing",
    handover: "not Ready",
};

function kindOf(to: KitchenStage): BulkKind | null {
    if (to === "PREPARING") return "prepare";
    if (to === "READY") return "ready";
    if (
        to === "COLLECTED" ||
        to === "OUT_FOR_DELIVERY" ||
        to === "HANDED_TO_COURIER"
    ) {
        return "handover";
    }
    return null;
}

const isAppointment = (row: Pick<OrderRow, "fulfilmentType">) =>
    row.fulfilmentType === "APPOINTMENT_IN_PERSON" ||
    row.fulfilmentType === "APPOINTMENT_ONLINE";

/** Someone's first name, for the hold's line. */
export function firstName(row: OrderRow): string {
    return rowCustomer(row).split(" ")[0] ?? "";
}

/**
 * The bulk bar's actions for the selected rows, in the design's order:
 * only the steps that apply to something selected, with how many. While a
 * batch is held, Mark ready stays on the bar, off. An order not paid yet
 * is left out of every step and named in `note`.
 */
export function bulkActions(
    rows: OrderRow[],
    holding: boolean,
): { actions: BulkAction[]; note: string | null } {
    const groups: Record<BulkKind, { row: OrderRow; to: KitchenStage }[]> = {
        prepare: [],
        ready: [],
        handover: [],
    };
    let unpaid = 0;
    for (const row of rows) {
        if (isAppointment(row)) continue;
        const next = rowNext(row);
        if (next.disabled === "Not paid yet.") unpaid += 1;
        if (!next.step || next.disabled) continue;
        const kind = kindOf(next.step.to);
        if (kind) groups[kind].push({ row, to: next.step.to });
    }
    const actions = (Object.keys(groups) as BulkKind[])
        .map((kind): BulkAction => {
            const group = groups[kind];
            const n = group.length;
            const heldOff = kind === "ready" && holding;
            return {
                kind,
                label: n ? `${LABEL[kind]} (${n})` : LABEL[kind],
                lines: group.map(({ row, to }) => ({
                    orderId: row.id,
                    from: row.stage as KitchenStage,
                    to,
                })),
                names: group.map(({ row }) => firstName(row)),
                hold: kind === "ready",
                skipped: rows.length - n,
                disabled: heldOff
                    ? "Wait until these are sent"
                    : n === 0
                      ? `None of these are ${kind === "ready" ? "Preparing" : kind === "prepare" ? "New" : "Ready"}`
                      : null,
                title:
                    kind === "ready" && n > 0
                        ? "Held 10 seconds, with Undo all"
                        : "",
            };
        })
        .filter((a) => a.lines.length > 0 || (a.kind === "ready" && holding));
    const note =
        unpaid === 0
            ? null
            : `${unpaid} ${unpaid === 1 ? "isn't" : "aren't"} paid yet, so ${unpaid === 1 ? "it" : "they"} can't be started`;
    return { actions, note };
}

/** "1 order selected", "4 orders selected". */
export function selectionLabel(n: number): string {
    return n === 1 ? "1 order selected" : `${n} orders selected`;
}

/** The held batch's first line: "Marking 3 ready in 8s". */
export function holdTitle(count: number, seconds: number): string {
    return `Marking ${count} ready in ${seconds}s`;
}

/**
 * The held batch's small line: whose orders, what was left alone, and that
 * leaving the page doesn't stop it (the server commits it).
 */
export function holdWho(names: string[], skipped: number): string {
    const left = skipped
        ? ` ${skipped} not preparing ${skipped === 1 ? "was" : "were"} left alone.`
        : "";
    return `${names.join(", ")}.${left} It still goes ahead if you leave this page.`;
}

/* ---- What a batch did, as the API answers it ---- */

export type BatchLineResult =
    | "PENDING"
    | "MOVED"
    | "MOVED_BY_SOMEONE_ELSE"
    | "NOT_FOUND"
    | "REFUSED"
    | "CANCELLED";

export interface StageBatch {
    id: string;
    status: "HELD" | "COMMITTED" | "CANCELLED";
    commitAt: string;
    committedAt: string | null;
    undoneAt: string | null;
    lines: {
        orderId: string;
        from: KitchenStage;
        to: KitchenStage;
        result: BatchLineResult;
        reason: string | null;
        eventId: string | null;
        undo: {
            result: "UNDONE" | "REFUSED";
            reason: string | null;
            told: boolean;
        } | null;
    }[];
}

const orders = (n: number) => (n === 1 ? "order" : "orders");

/** "moved by someone else", or each reason once: "moved by someone else; not paid yet". */
function reasons(list: (string | null)[]): string {
    const words = list.map((r) => r ?? "try again");
    return words.filter((w, i) => words.indexOf(w) === i).join("; ");
}

/**
 * What the commit did, in words: "3 marked ready. 1 couldn't be: moved by
 * someone else". Orders the action left alone are counted after a "·".
 */
export function commitSummary(
    batch: StageBatch,
    kind: BulkKind,
    skipped = 0,
): string {
    const moved = batch.lines.filter((l) => l.result === "MOVED").length;
    const failed = batch.lines.filter(
        (l) =>
            l.result === "MOVED_BY_SOMEONE_ELSE" ||
            l.result === "NOT_FOUND" ||
            l.result === "REFUSED",
    );
    const pending = batch.lines.filter((l) => l.result === "PENDING").length;
    const head =
        kind === "ready"
            ? `${moved} marked ready`
            : kind === "prepare"
              ? `${moved} ${orders(moved)} preparing`
              : `${moved} ${orders(moved)} done`;
    const parts = [
        skipped ? `${head} · ${skipped} skipped: ${NOT[kind]}` : head,
    ];
    if (failed.length) {
        parts.push(
            `${failed.length} couldn't be: ${reasons(failed.map((l) => l.reason))}`,
        );
    }
    if (pending) parts.push(`${pending} still going through`);
    return parts.join(". ");
}

/** Whether anything in the batch moved, so Undo all has something to undo. */
export function anyMoved(batch: StageBatch): boolean {
    return batch.lines.some((l) => l.result === "MOVED");
}

/**
 * What Undo all did. Held: "Back to Preparing. Nothing was sent." After the
 * commit: "2 undone. 1 couldn't be: already collected", and where a
 * customer had already been told (A14), it says so rather than pretending
 * the notice was pulled back.
 */
export function undoSummary(
    batch: StageBatch,
    nameOf: (orderId: string) => string,
): string {
    if (batch.status === "CANCELLED") {
        const from = batch.lines[0]?.from ?? "PREPARING";
        return `Back to ${STAGE_LABEL[from]}. Nothing was sent.`;
    }
    const undone = batch.lines.filter((l) => l.undo?.result === "UNDONE");
    const refused = batch.lines.filter((l) => l.undo?.result === "REFUSED");
    const told = undone.filter((l) => l.undo?.told);
    const parts = [`${undone.length} undone`];
    if (refused.length) {
        parts.push(
            `${refused.length} couldn't be: ${reasons(refused.map((l) => l.undo?.reason ?? null))}`,
        );
    }
    if (told.length) {
        if (told.length === undone.length) {
            parts.push("They've already been told.");
        } else {
            const names = told.map((l) => nameOf(l.orderId));
            parts.push(
                `${names.join(", ")} ${names.length === 1 ? "has" : "have"} already been told.`,
            );
        }
    }
    return parts.join(". ");
}
