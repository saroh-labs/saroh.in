"use client";

import { showError, showInfo, showUndo } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { moveStage, undoStage } from "@/lib/orders/actions";
import { HOLD_MS, STAGE_LABEL } from "@/lib/orders/lifecycle";
import type { KitchenStage } from "@/lib/orders/read";

/**
 * Take an order's next step from the Orders list — its row menu or its quick
 * view (plan B, B5) — through the same write as Order Detail's button.
 *
 * The step is recorded at once and the toast offers Undo for as long as the
 * API keeps the step undoable (`UNDO_WINDOW_MS`, ten seconds). The undo
 * rule stands: once the customer has been told of a step (A14), the API
 * refuses its undo and says so, and a move it answers `undoable: false` for
 * draws no Undo at all. Nothing is sent to the customer from here.
 */
export function useOrderStep(onDone?: () => void) {
    const router = useRouter();
    const [busy, startTransition] = useTransition();

    const take = (order: {
        id: string;
        orderId: string;
        stage: string;
        to: KitchenStage;
    }) =>
        startTransition(async () => {
            const res = await moveStage(order.id, { to: order.to });
            if (!res.ok) {
                showError(res.error);
                router.refresh();
                return;
            }
            const from = order.stage as KitchenStage;
            const said = `#${order.orderId} ${STAGE_LABEL[order.to].toLowerCase()}.`;
            const data = res.data as { eventId: string; undoable?: boolean };
            if (data.undoable === false) {
                showInfo(said);
            } else {
                showUndo(
                    said,
                    () =>
                        startTransition(async () => {
                            const back = await undoStage(
                                order.id,
                                data.eventId,
                            );
                            if (!back.ok) {
                                showError(back.error);
                            } else {
                                showInfo(
                                    `#${order.orderId} is back to ${STAGE_LABEL[from].toLowerCase()}.`,
                                );
                            }
                            router.refresh();
                            onDone?.();
                        }),
                    { duration: HOLD_MS },
                );
            }
            router.refresh();
            onDone?.();
        });

    return { busy, take };
}
