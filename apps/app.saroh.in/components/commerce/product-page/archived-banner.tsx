"use client";

import { showError, showUndo } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { ViewerDate } from "@/components/shared/viewer-date";
import { patchProduct } from "@/lib/products/actions";

/**
 * Under an archived product's header: when it went, what that means, and
 * the way back — restored as a draft, so nothing reaches customers until
 * someone publishes it on purpose.
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
    const router = useRouter();
    const [pending, start] = useTransition();

    function restore() {
        start(async () => {
            const res = await patchProduct(storeId, productId, {
                status: "DRAFT",
            });
            if (!res.ok) {
                showError(res.error);
                return;
            }
            router.refresh();
            showUndo("Restored as a draft. Publish it when it is ready.", () =>
                start(async () => {
                    const undo = await patchProduct(storeId, productId, {
                        status: "ARCHIVED",
                    });
                    if (!undo.ok) showError(undo.error);
                    router.refresh();
                }),
            );
        });
    }

    return (
        <div
            role="note"
            className="flex flex-wrap items-center gap-2.5 rounded-[10px] bg-muted px-[18px] py-[11px]"
        >
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
                        "Archived."
                    )}
                </strong>{" "}
                It is not sold and its page does not open. Past orders, reviews
                and stock history are kept below.
            </p>
            {canWrite ? (
                <button
                    type="button"
                    disabled={pending}
                    onClick={restore}
                    className="h-8 rounded-[9px] bg-foreground px-3 text-[12.5px] font-semibold text-background hover:bg-foreground/90 disabled:opacity-60 coarse:h-11"
                >
                    {pending ? "Restoring…" : "Restore as a draft"}
                </button>
            ) : null}
        </div>
    );
}
