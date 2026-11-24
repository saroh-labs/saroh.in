"use client";

import { Button } from "@saroh/ui/button";
import { showError, showUndo } from "@saroh/ui/toast";
import { useTransition } from "react";

import {
    runOne,
    useQuickEdits,
} from "@/components/commerce/quick-edits/quick-edits";
import { ViewerDate } from "@/components/shared/dates/viewer-date";
import { runAction } from "@/lib/api/run-action";
import { patchProduct } from "@/lib/products/actions";
import { PRODUCT_STATUS_WORD } from "@/lib/products/status-word";
import { Notice } from "@saroh/ui/notice";

/**
 * Under an archived product's header: when it went, what that means, and
 * a second way back — to a draft, so nothing reaches customers until
 * someone publishes it. The header's Sell again is the first.
 */
export function ArchivedBanner({
    storeId,
    productId,
    archivedAt,
    canWrite,
}: {
    storeId: string;
    productId: string;
    archivedAt: string | null;
    canWrite: boolean;
}) {
    const quick = useQuickEdits();
    const [pending, start] = useTransition();
    // Shown at once, the page read again after (DEC-259); refused, put back.
    const send = (status: "DRAFT" | "ARCHIVED") =>
        runOne(quick, productId, { status }, (org) =>
            patchProduct(storeId, productId, { status }, org),
        );

    function restore() {
        start(async () => {
            const res = await runAction(() => send("DRAFT"));
            if (!res) return;
            if (!res.ok) {
                showError(res.error);
                return;
            }
            showUndo("Back to a draft. Publish it when it is ready.", () =>
                start(async () => {
                    const undo = await runAction(() => send("ARCHIVED"));
                    if (!undo) return;
                    if (!undo.ok) showError(undo.error);
                }),
            );
        });
    }

    return (
        <Notice layout="banner" align="center">
            <div className="flex flex-wrap items-center gap-2.5">
                <p className="flex-[1_1_280px] text-pretty text-[13px] leading-[1.5] text-foreground/75">
                    <strong className="font-semibold text-foreground">
                        {archivedAt ? (
                            <>
                                Archived on{" "}
                                <ViewerDate
                                    iso={archivedAt}
                                    variant="dayMonthLong"
                                />
                                .
                            </>
                        ) : (
                            `${PRODUCT_STATUS_WORD.ARCHIVED}.`
                        )}
                    </strong>{" "}
                    It is not sold and its page does not open. Past orders,
                    reviews and stock history are kept below.
                </p>
                {canWrite ? (
                    <Button
                        size="sm"
                        type="button"
                        variant="outline"
                        onClick={restore}
                        busy={pending}
                        busyLabel="Moving it…"
                    >
                        Back to draft
                    </Button>
                ) : null}
            </div>
        </Notice>
    );
}
