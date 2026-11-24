"use client";

import { showUndo } from "@saroh/ui/toast";
import { useTransition } from "react";

import { reportFailure } from "@/components/billing/plan-refusal";
import {
    runOne,
    useQuickEdits,
} from "@/components/commerce/quick-edits/quick-edits";
import { runAction } from "@/lib/api/run-action";
import { UNREACHED } from "@/lib/api/unreached";
import { setProductStatus } from "@/lib/products/actions";
import type { ProductStatus } from "@/lib/products/service";

/**
 * Publish, Archive and Sell again from the product page, each at once and
 * each with Undo (reversible by default): "Tarini is live." / "Archived
 * Tarini." The page shows it at once and reads itself again after either
 * (the page's quick edits, DEC-259); refused, it is put back. A plan's refusal (selling
 * again past the products limit) is its own notice.
 */
export function useProductStatus(product: {
    id: string;
    name: string;
    status: ProductStatus;
}) {
    const quick = useQuickEdits();
    const send = (to: ProductStatus) =>
        runOne(quick, product.id, { status: to }, (org) =>
            setProductStatus(product.id, to, org),
        );
    const [pending, start] = useTransition();

    function setStatus(next: ProductStatus) {
        const was = product.status;
        start(async () => {
            const res = await runAction(() => send(next));
            if (!res) return;
            if (!res.ok) {
                reportFailure(res, "It couldn't be changed. Try again.");
                return;
            }
            showUndo(
                next === "ARCHIVED"
                    ? `Archived ${product.name}.`
                    : next === "PUBLISHED"
                      ? `${product.name} is live.`
                      : `${product.name} is a draft.`,
                async () => {
                    const back = await runAction(() => send(was), {
                        quiet: true,
                    });
                    if (!back) return { ok: false, error: UNREACHED };
                    return back;
                },
            );
        });
    }

    return { pending, setStatus };
}
