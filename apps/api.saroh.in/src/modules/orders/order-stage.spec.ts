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
    fulfilment: "PICKUP",
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

    it("a delivery (B2c): Ready → Out for delivery (SHIPPED) → Delivered", () => {
        let o = order({ fulfilment: "LOCAL_DELIVERY" });
        o = step(step(o, "PREPARING"), "READY");
        expect(nextStages(o)).toEqual(["OUT_FOR_DELIVERY"]);
        o = step(o, "OUT_FOR_DELIVERY");
        expect(o.status).toBe("SHIPPED");
        o = step(o, "DELIVERED");
        expect(o).toMatchObject({ stage: "DELIVERED", status: "DELIVERED" });
    });

    it.each<[OrderFulfilment, OrderStage]>([
        ["LOCAL_DELIVERY", "COLLECTED"],
        ["PICKUP", "HANDED_TO_COURIER"],
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
        const cur = { stage: "NEW" as const, fulfilment: "PICKUP" as const };
        expect(stageForStatus("PROCESSING", cur).stage).toBe("PREPARING");
        expect(stageForStatus("DELIVERED", cur).stage).toBe("COLLECTED");
        const courier = {
            stage: "READY" as const,
            fulfilment: "LOCAL_DELIVERY" as const,
        };
        expect(stageForStatus("SHIPPED", courier)).toEqual({
            stage: "OUT_FOR_DELIVERY",
        });
        expect(
            stageForStatus("DELIVERED", {
                stage: "HANDED_TO_COURIER",
                fulfilment: "LOCAL_DELIVERY",
            }).stage,
        ).toBe("DELIVERED");
        expect(stageForStatus("CANCELLED", cur)).toEqual({ stage: "NEW" });
    });

    // Deliberate change (B2a): it used to turn any order it SHIPPED into a
    // delivery at HANDED_TO_COURIER. It never changes the type now.
    it.each<[OrderFulfilment, RegExp]>([
        [
            "PICKUP",
            /^A pick-up order isn't shipped\. Change how it's fulfilled first\.$/,
        ],
        ["DIGITAL", /^A digital order isn't shipped/],
        ["APPOINTMENT_ONLINE", /^An appointment isn't shipped/],
    ])(
        "SHIPPED on a %s order is refused (409), not turned into a delivery",
        (fulfilment, sentence) => {
            const run = () =>
                stageForStatus("SHIPPED", { stage: "READY", fulfilment });
            expect(run).toThrow(ConflictException);
            expect(run).toThrow(sentence);
        },
    );

    it("DELIVERED on an appointment is refused: its visits finish it", () => {
        expect(() =>
            stageForStatus("DELIVERED", {
                stage: "NEW",
                fulfilment: "APPOINTMENT_IN_PERSON",
            }),
        ).toThrow(ConflictException);
    });

    it("per type: SHIPPED and DELIVERED land on the type's own stages", () => {
        const at = (fulfilment: OrderFulfilment, stage: OrderStage = "READY") =>
            ({ stage, fulfilment }) as const;
        expect(stageForStatus("SHIPPED", at("SHIPPING")).stage).toBe(
            "HANDED_TO_COURIER",
        );
        // A local delivery goes out for delivery, except one already with
        // a courier the old way.
        expect(stageForStatus("SHIPPED", at("LOCAL_DELIVERY")).stage).toBe(
            "OUT_FOR_DELIVERY",
        );
        expect(
            stageForStatus("SHIPPED", at("LOCAL_DELIVERY", "HANDED_TO_COURIER"))
                .stage,
        ).toBe("HANDED_TO_COURIER");
        expect(stageForStatus("DELIVERED", at("PICKUP")).stage).toBe(
            "COLLECTED",
        );
        expect(stageForStatus("DELIVERED", at("SHIPPING")).stage).toBe(
            "DELIVERED",
        );
        expect(stageForStatus("DELIVERED", at("DIGITAL", "NEW")).stage).toBe(
            "SENT",
        );
        // No Preparing step: PROCESSING leaves a digital order where it is.
        expect(stageForStatus("PROCESSING", at("DIGITAL", "NEW")).stage).toBe(
            "NEW",
        );
    });
});

describe("the six types (order-stage over fulfilment.ts)", () => {
    const paid = (
        fulfilment: OrderFulfilment,
        over: Partial<StageSubject> = {},
    ) => order({ fulfilment, ...over });

    it("a pick-up and a local delivery walk their own steps, each onto its status", () => {
        const walk = (fulfilment: OrderFulfilment, stages: OrderStage[]) => {
            let o = paid(fulfilment);
            const statuses: string[] = [];
            for (const to of stages) {
                o = step(o, to);
                statuses.push(o.status);
            }
            return statuses;
        };
        const pickUp: OrderStage[] = ["PREPARING", "READY", "COLLECTED"];
        expect(walk("PICKUP", pickUp)).toEqual([
            "PROCESSING",
            "PROCESSING",
            "DELIVERED",
        ]);
        const local: OrderStage[] = [
            "PREPARING",
            "READY",
            "OUT_FOR_DELIVERY",
            "DELIVERED",
        ];
        expect(walk("LOCAL_DELIVERY", local)).toEqual([
            "PROCESSING",
            "PROCESSING",
            "SHIPPED",
            "DELIVERED",
        ]);
    });

    it("a ready local delivery goes out for delivery, never to a courier", () => {
        for (const fulfilment of ["LOCAL_DELIVERY"] as const) {
            const ready = paid(fulfilment, {
                stage: "READY",
                status: "PROCESSING",
            });
            expect(nextStages(ready)).toEqual(["OUT_FOR_DELIVERY"]);
            const run = () => planStageMove(ready, "HANDED_TO_COURIER");
            expect(run).toThrow(BadRequestException);
            expect(run).toThrow(
                "This order is a local delivery, so it goes out for delivery, not to a courier.",
            );
            expect(() => planStageMove(ready, "COLLECTED")).toThrow(
                "This order is a local delivery, so it goes out for delivery, not collected.",
            );
        }
    });

    it("a shipment is handed to a courier, never sent out for delivery", () => {
        expect(() =>
            planStageMove(
                paid("SHIPPING", { stage: "READY", status: "PROCESSING" }),
                "OUT_FOR_DELIVERY",
            ),
        ).toThrow(
            "This order is a shipment, so it is handed to a courier, not sent out for delivery.",
        );
    });

    it("a local delivery handed to a courier before the switch reaches Delivered after it", () => {
        // B2c's migration renamed DELIVERY to LOCAL_DELIVERY and left the
        // stage: the legacy move takes it on, and still does after B2d.
        for (const fulfilment of ["LOCAL_DELIVERY"] as const) {
            const o = paid(fulfilment, {
                stage: "HANDED_TO_COURIER",
                status: "SHIPPED",
            });
            expect(nextStages(o)).toEqual(["DELIVERED"]);
            expect(step(o, "DELIVERED")).toMatchObject({
                stage: "DELIVERED",
                status: "DELIVERED",
            });
            expect(() => planStageMove(o, "OUT_FOR_DELIVERY")).toThrow(
                BadRequestException,
            );
        }
    });

    it("release 1 serves release 2's rows: Out for delivery → Delivered, and the legacy courier move", () => {
        const out = paid("LOCAL_DELIVERY", {
            stage: "OUT_FOR_DELIVERY",
            status: "SHIPPED",
        });
        expect(nextStages(out)).toEqual(["DELIVERED"]);
        expect(planStageMove(out, "DELIVERED")).toMatchObject({
            fromStatus: "SHIPPED",
            toStatus: "DELIVERED",
        });
        const legacy = paid("LOCAL_DELIVERY", {
            stage: "HANDED_TO_COURIER",
            status: "SHIPPED",
        });
        expect(nextStages(legacy)).toEqual(["DELIVERED"]);
    });

    it("shipping: Ready → Handed to courier (SHIPPED) → Delivered", () => {
        let o = step(step(paid("SHIPPING"), "PREPARING"), "READY");
        expect(nextStages(o)).toEqual(["HANDED_TO_COURIER"]);
        o = step(o, "HANDED_TO_COURIER");
        expect(o.status).toBe("SHIPPED");
        o = step(o, "DELIVERED");
        expect(o).toMatchObject({ stage: "DELIVERED", status: "DELIVERED" });
        expect(nextStages(o)).toEqual([]);
    });

    it("digital skips Preparing: Paid → Sent ends DELIVERED, and only once paid", () => {
        const o = paid("DIGITAL");
        expect(nextStages(o)).toEqual(["SENT"]);
        expect(step(o, "SENT")).toMatchObject({
            stage: "SENT",
            status: "DELIVERED",
        });
        expect(() => planStageMove(o, "PREPARING")).toThrow(
            BadRequestException,
        );
        const unpaid = paid("DIGITAL", { paymentStatus: "UNPAID" });
        expect(nextStages(unpaid)).toEqual([]);
        expect(() => planStageMove(unpaid, "SENT")).toThrow(
            /not paid yet, so it cannot be sent/,
        );
    });

    it.each<OrderFulfilment>(["APPOINTMENT_IN_PERSON", "APPOINTMENT_ONLINE"])(
        "an %s order has no kitchen steps: its visits move it",
        (fulfilment) => {
            const o = paid(fulfilment);
            expect(nextStages(o)).toEqual([]);
            expect(() => planStageMove(o, "PREPARING")).toThrow(
                /moves on by its visits/,
            );
        },
    );

    it("a shipping order is not collected, with today's sentence", () => {
        expect(() =>
            planStageMove(
                paid("SHIPPING", { stage: "READY", status: "PROCESSING" }),
                "COLLECTED",
            ),
        ).toThrow(/handed to a courier, not collected/);
    });

    it("a stage no type has from here is refused in step words", () => {
        expect(() =>
            planStageMove(paid("SHIPPING", { stage: "NEW" }), "SENT"),
        ).toThrow("An order that is new cannot become sent.");
    });
});
