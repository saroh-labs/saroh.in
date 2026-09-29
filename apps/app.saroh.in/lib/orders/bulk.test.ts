import { describe, expect, it } from "vitest";

import type { StageBatch } from "@/lib/orders/bulk";
import {
    anyMoved,
    bulkActions,
    commitSummary,
    holdTitle,
    holdWho,
    selectionLabel,
    undoSummary,
} from "@/lib/orders/bulk";
import type { OrderRow } from "@/lib/orders/business-service";
import type { FulfilmentStep, KitchenStage } from "@/lib/orders/read";

/**
 * The Orders list's bulk bar (plan B, B6): which steps a selection can
 * take and how many, the rows it leaves out and why, the hold's words, and
 * what a batch did — in words, never counts alone.
 */

const PICKUP: FulfilmentStep[] = [
    { stage: "NEW", label: "New" },
    { stage: "PREPARING", label: "Preparing" },
    { stage: "READY", label: "Ready" },
    { stage: "COLLECTED", label: "Collected" },
];

const SHIPPING: FulfilmentStep[] = [
    { stage: "NEW", label: "New" },
    { stage: "PREPARING", label: "Packing" },
    { stage: "READY", label: "Packed" },
    { stage: "HANDED_TO_COURIER", label: "With the courier" },
    { stage: "DELIVERED", label: "Delivered" },
];

let seq = 0;
function row(stage: KitchenStage, over: Partial<OrderRow> = {}): OrderRow {
    seq += 1;
    const steps = over.steps ?? PICKUP;
    return {
        id: `o${seq}`,
        orderId: `10${seq}`,
        placedAt: "2026-09-27T09:00:00.000Z",
        ageMinutes: 12,
        store: { id: "s1", name: "Hill Road" },
        customer: { id: "c1", name: "Priya Raman" },
        status: stage === "NEW" ? "PENDING" : "PROCESSING",
        paymentStatus: "PAID",
        stage,
        standing: "UNFULFILLED",
        payment: "PAID",
        currency: "INR",
        total: "480.00",
        unpaidAmount: "0.00",
        itemCount: 2,
        productNames: ["Sourdough loaf"],
        moreProducts: 0,
        fulfilmentType: "PICKUP",
        fulfilmentLabel: "Pick-up",
        steps,
        stepIndex: steps.findIndex((s) => s.stage === stage),
        ticketName: "Kitchen ticket",
        ...over,
    };
}

function batch(over: Partial<StageBatch> = {}): StageBatch {
    return {
        id: "b1",
        status: "COMMITTED",
        commitAt: "2026-09-28T10:00:10.000Z",
        committedAt: "2026-09-28T10:00:10.000Z",
        undoneAt: null,
        lines: [],
        ...over,
    };
}

type Line = StageBatch["lines"][number];
function line(over: Partial<Line> = {}): Line {
    return {
        orderId: "o1",
        from: "PREPARING",
        to: "READY",
        result: "MOVED",
        reason: null,
        eventId: "e1",
        undo: null,
        ...over,
    };
}

describe("bulkActions", () => {
    it("offers only the steps that apply, with how many (the design)", () => {
        const rows = [
            row("PREPARING"),
            row("PREPARING"),
            row("PREPARING"),
            row("NEW"),
        ];
        const { actions, note } = bulkActions(rows, false);
        expect(actions.map((a) => a.label)).toEqual([
            "Start preparing (1)",
            "Mark ready (3)",
        ]);
        expect(note).toBeNull();
        const ready = actions[1];
        expect(ready.hold).toBe(true);
        expect(ready.skipped).toBe(1);
        expect(ready.lines).toEqual(
            rows.slice(0, 3).map((r) => ({
                orderId: r.id,
                from: "PREPARING",
                to: "READY",
            })),
        );
        expect(ready.names).toEqual(["Priya", "Priya", "Priya"]);
        expect(actions[0].hold).toBe(false);
    });

    it("hands each Ready order over by its own type", () => {
        const pickup = row("READY");
        const shipping = row("READY", {
            fulfilmentType: "SHIPPING",
            fulfilmentLabel: "Shipping",
            steps: SHIPPING,
        });
        const { actions } = bulkActions([pickup, shipping], false);
        expect(actions).toHaveLength(1);
        expect(actions[0].label).toBe("Mark collected / handed over (2)");
        expect(actions[0].lines.map((l) => l.to)).toEqual([
            "COLLECTED",
            "HANDED_TO_COURIER",
        ]);
    });

    it("names orders not paid yet, and leaves them out of every step", () => {
        const unpaid = row("NEW", {
            paymentStatus: "UNPAID",
            payment: "UNPAID",
        });
        const one = bulkActions([unpaid, row("NEW")], false);
        expect(one.note).toBe("1 isn't paid yet — the kitchen can't start it");
        expect(one.actions[0].lines).toHaveLength(1);
        const two = bulkActions([unpaid, { ...unpaid, id: "ox" }], false);
        expect(two.note).toBe(
            "2 aren't paid yet — the kitchen can't start them",
        );
        expect(two.actions).toEqual([]);
    });

    it("keeps Mark ready on the bar, off, while a batch is held", () => {
        const { actions } = bulkActions([row("NEW")], true);
        const ready = actions.find((a) => a.kind === "ready");
        expect(ready?.disabled).toBe("Wait until these are sent");
        expect(ready?.label).toBe("Mark ready");
    });

    it("moves a walk-in with the rest, by the name they gave", () => {
        const walkIn = row("PREPARING", {
            customer: null,
            walkIn: { name: "Ravi Kumar", phone: null },
        });
        const { actions } = bulkActions([walkIn], false);
        expect(actions[0].names).toEqual(["Ravi"]);
    });

    it("leaves appointments, cancelled and finished orders out", () => {
        const { actions } = bulkActions(
            [
                row("NEW", {
                    fulfilmentType: "APPOINTMENT_IN_PERSON",
                    steps: [],
                    stepIndex: -1,
                }),
                row("PREPARING", { status: "CANCELLED" }),
                row("COLLECTED", { status: "DELIVERED" }),
            ],
            false,
        );
        expect(actions).toEqual([]);
    });
});

describe("the hold's words", () => {
    it("counts down without claiming a message is sent", () => {
        expect(holdTitle(3, 8)).toBe("Marking 3 ready in 8s");
        expect(holdWho(["Asha", "Ravi"], 0)).toBe(
            "Asha, Ravi. It still goes ahead if you leave this page.",
        );
        expect(holdWho(["Asha"], 2)).toBe(
            "Asha. 2 not preparing were left alone. It still goes ahead if you leave this page.",
        );
        expect(selectionLabel(1)).toBe("1 order selected");
        expect(selectionLabel(4)).toBe("4 orders selected");
    });
});

describe("commitSummary", () => {
    it("says what moved and what couldn't, and why", () => {
        const b = batch({
            lines: [
                line(),
                line({ orderId: "o2" }),
                line({ orderId: "o3" }),
                line({
                    orderId: "o4",
                    result: "MOVED_BY_SOMEONE_ELSE",
                    reason: "moved by someone else",
                    eventId: null,
                }),
            ],
        });
        expect(commitSummary(b, "ready")).toBe(
            "3 marked ready. 1 couldn't be: moved by someone else",
        );
        expect(anyMoved(b)).toBe(true);
    });

    it("counts the orders the action left alone", () => {
        const b = batch({
            lines: [line({ from: "NEW", to: "PREPARING" })],
        });
        expect(commitSummary(b, "prepare", 1)).toBe(
            "1 order preparing · 1 skipped: not New",
        );
    });

    it("names each reason once, and what is still going through", () => {
        const b = batch({
            lines: [
                line({ result: "REFUSED", reason: "not paid yet" }),
                line({
                    orderId: "o2",
                    result: "NOT_FOUND",
                    reason: "not found",
                }),
                line({
                    orderId: "o3",
                    result: "REFUSED",
                    reason: "not paid yet",
                }),
                line({ orderId: "o4", result: "PENDING", eventId: null }),
            ],
        });
        expect(commitSummary(b, "handover")).toBe(
            "0 orders done. 3 couldn't be: not paid yet; not found. 1 still going through",
        );
        expect(anyMoved(b)).toBe(false);
    });
});

describe("undoSummary", () => {
    const nameOf = (id: string) => ({ o1: "Asha", o2: "Ravi" })[id] ?? "?";

    it("a held batch undone moved nothing", () => {
        const b = batch({
            status: "CANCELLED",
            committedAt: null,
            lines: [line({ result: "PENDING", eventId: null })],
        });
        expect(undoSummary(b, nameOf)).toBe(
            "Back to Preparing. Nothing was sent.",
        );
    });

    it("names what couldn't be undone after the commit", () => {
        const b = batch({
            lines: [
                line({ undo: { result: "UNDONE", reason: null, told: false } }),
                line({
                    orderId: "o2",
                    undo: { result: "UNDONE", reason: null, told: false },
                }),
                line({
                    orderId: "o3",
                    undo: {
                        result: "REFUSED",
                        reason: "already collected",
                        told: false,
                    },
                }),
            ],
        });
        expect(undoSummary(b, nameOf)).toBe(
            "2 undone. 1 couldn't be: already collected",
        );
    });

    it("says they've already been told, rather than that it was pulled back", () => {
        const all = batch({
            lines: [
                line({ undo: { result: "UNDONE", reason: null, told: true } }),
            ],
        });
        expect(undoSummary(all, nameOf)).toBe(
            "1 undone. They've already been told.",
        );
        const some = batch({
            lines: [
                line({ undo: { result: "UNDONE", reason: null, told: true } }),
                line({
                    orderId: "o2",
                    undo: { result: "UNDONE", reason: null, told: false },
                }),
            ],
        });
        expect(undoSummary(some, nameOf)).toBe(
            "2 undone. Asha has already been told.",
        );
    });
});
