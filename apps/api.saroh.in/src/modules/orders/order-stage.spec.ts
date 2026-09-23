import { BadRequestException, ConflictException } from "@nestjs/common";

import type { OrderFulfilment, OrderStage, StageSubject } from "./order-stage";
import {
    canEditItems,
    nextStages,
    planStageMove,
    planUndo,
    stageForStatus,
    UNDO_WINDOW_MS,
} from "./order-stage";

const order = (over: Partial<StageSubject> = {}): StageSubject => ({
    stage: "NEW",
    status: "PENDING",
    paymentStatus: "PAID",
    fulfilment: "COLLECT",
    ...over,
});

/** Walk a subject through a move the way the service writes it. */
function step(o: StageSubject, to: OrderStage): StageSubject {
    const move = planStageMove(o, to);
    return { ...o, stage: move.to, status: move.toStatus };
}

describe("the kitchen flow (order-stage)", () => {
    it("a collection: New → Preparing → Ready → Collected ends DELIVERED", () => {
        let o = order();
        o = step(o, "PREPARING");
        expect(o.status).toBe("PROCESSING");
        o = step(o, "READY");
        expect(o.status).toBe("PROCESSING");
        o = step(o, "COLLECTED");
        expect(o).toMatchObject({ stage: "COLLECTED", status: "DELIVERED" });
        expect(nextStages(o)).toEqual([]);
    });

    it("a delivery: Ready → Handed to courier (SHIPPED) → Delivered", () => {
        let o = order({ fulfilment: "DELIVERY" });
        o = step(step(o, "PREPARING"), "READY");
        expect(nextStages(o)).toEqual(["HANDED_TO_COURIER"]);
        o = step(o, "HANDED_TO_COURIER");
        expect(o.status).toBe("SHIPPED");
        o = step(o, "DELIVERED");
        expect(o).toMatchObject({ stage: "DELIVERED", status: "DELIVERED" });
    });

    it.each<[OrderFulfilment, OrderStage]>([
        ["DELIVERY", "COLLECTED"],
        ["COLLECT", "HANDED_TO_COURIER"],
    ])("a %s order cannot become %s", (fulfilment, to) => {
        expect(() =>
            planStageMove(
                order({ fulfilment, stage: "READY", status: "PROCESSING" }),
                to,
            ),
        ).toThrow(BadRequestException);
    });

    it("refuses to skip a step or go backwards", () => {
        expect(() => planStageMove(order(), "READY")).toThrow(
            BadRequestException,
        );
        expect(() =>
            planStageMove(
                order({ stage: "READY", status: "PROCESSING" }),
                "PREPARING",
            ),
        ).toThrow(BadRequestException);
    });

    it.each(["UNPAID", "FAILED", "REFUNDED"])(
        "an order that is %s cannot start preparing",
        (paymentStatus) => {
            expect(() =>
                planStageMove(order({ paymentStatus }), "PREPARING"),
            ).toThrow(/not paid yet/);
            // The kitchen is blocked: no next step is offered.
            expect(nextStages(order({ paymentStatus }))).toEqual([]);
        },
    );

    it("a cancelled order does not move", () => {
        const o = order({ status: "CANCELLED" });
        expect(() => planStageMove(o, "PREPARING")).toThrow(ConflictException);
        expect(nextStages(o)).toEqual([]);
    });

    it("a stage out of step with its status is refused, not guessed at", () => {
        expect(() =>
            planStageMove(order({ status: "PROCESSING" }), "PREPARING"),
        ).toThrow(/does not match/);
    });
});

describe("undo (order-stage)", () => {
    const at = new Date("2026-09-27T10:00:00Z");
    const ready = {
        id: "ev_ready",
        kind: "STAGE",
        fromStage: "PREPARING" as const,
        toStage: "READY" as const,
        fromStatus: "PROCESSING",
        toStatus: "PROCESSING",
        createdAt: at,
        undoneAt: null,
    };
    const now = new Date(at.getTime() + 5_000);
    const state = { stage: "READY" as const, status: "PROCESSING" };

    it("undoing Ready returns to Preparing", () => {
        expect(planUndo(state, ready, "ev_ready", now)).toEqual({
            stage: "PREPARING",
            status: "PROCESSING",
        });
    });

    it("a second undo of the same step is refused", () => {
        expect(() =>
            planUndo(state, { ...ready, undoneAt: now }, "ev_ready", now),
        ).toThrow(/already undone/);
    });

    it("only the last step can be undone", () => {
        // The latest thing on the order is the Undo itself.
        expect(() => planUndo(state, ready, "ev_undo", now)).toThrow(
            /Only the last step/,
        );
    });

    it("undoing Collected restores PROCESSING", () => {
        const collected = {
            ...ready,
            id: "ev_c",
            fromStage: "READY" as const,
            toStage: "COLLECTED" as const,
            toStatus: "DELIVERED",
        };
        expect(
            planUndo(
                { stage: "COLLECTED", status: "DELIVERED" },
                collected,
                "ev_c",
                now,
            ),
        ).toEqual({ stage: "READY", status: "PROCESSING" });
    });

    it("an undo past the window is refused", () => {
        const late = new Date(at.getTime() + UNDO_WINDOW_MS + 1);
        expect(() => planUndo(state, ready, "ev_ready", late)).toThrow(
            /too late/,
        );
        // Right at the edge is still in time.
        const edge = new Date(at.getTime() + UNDO_WINDOW_MS);
        expect(() => planUndo(state, ready, "ev_ready", edge)).not.toThrow();
    });

    it("refuses to undo anything but a kitchen step, or a step the order has moved on from", () => {
        expect(() =>
            planUndo(state, { ...ready, kind: "REFUND" }, "ev_ready", now),
        ).toThrow(BadRequestException);
        expect(() =>
            planUndo(
                { stage: "COLLECTED", status: "DELIVERED" },
                ready,
                "ev_ready",
                now,
            ),
        ).toThrow(/moved on/);
    });
});

describe("editing and the legacy status PATCH", () => {
    it("items can change only while the order is New", () => {
        expect(
            canEditItems({
                stage: "NEW",
                status: "PENDING",
                paymentStatus: "PAID",
            }),
        ).toBe(true);
        expect(
            canEditItems({
                stage: "PREPARING",
                status: "PROCESSING",
                paymentStatus: "PAID",
            }),
        ).toBe(false);
        expect(
            canEditItems({
                stage: "NEW",
                status: "CANCELLED",
                paymentStatus: "PAID",
            }),
        ).toBe(false);
        expect(
            canEditItems({
                stage: "NEW",
                status: "PENDING",
                paymentStatus: "REFUNDED",
            }),
        ).toBe(false);
    });

    it("keeps the stage in step with a status set by the old PATCH", () => {
        const cur = { stage: "NEW" as const, fulfilment: "COLLECT" as const };
        expect(stageForStatus("PROCESSING", cur).stage).toBe("PREPARING");
        expect(stageForStatus("SHIPPED", cur)).toEqual({
            stage: "HANDED_TO_COURIER",
            fulfilment: "DELIVERY",
        });
        expect(stageForStatus("DELIVERED", cur).stage).toBe("COLLECTED");
        expect(
            stageForStatus("DELIVERED", {
                stage: "HANDED_TO_COURIER",
                fulfilment: "DELIVERY",
            }).stage,
        ).toBe("DELIVERED");
        expect(stageForStatus("CANCELLED", cur)).toEqual(cur);
    });
});
