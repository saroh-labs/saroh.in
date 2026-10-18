"use client";

import { showUndo } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { reportFailure } from "@/components/billing/plan-refusal";
import { runAction } from "@/lib/api/run-action";
import { UNREACHED } from "@/lib/api/unreached";
import { setProductStatus } from "@/lib/products/actions";
import type { ProductStatus } from "@/lib/products/service";

/**
 * Publish, Archive and Sell again from the product page, each at once and
 * each with Undo (reversible by default): "Tarini is live." / "Archived
 * Tarini." The page is read again after either. A plan's refusal (selling
 * again past the products limit) is its own notice.
 */
export function useProductStatus(product: {
    id: string;
    name: string;
    status: ProductStatus;
}) {
    const router = useRouter();
    const [pending, start] = useTransition();

    function setStatus(next: ProductStatus) {
        const was = product.status;
        start(async () => {
            const res = await runAction(() =>
                setProductStatus(product.id, next),
            );
            if (!res) return;
            if (!res.ok) {
                reportFailure(res, "It couldn't be changed. Try again.");
                return;
            }
            router.refresh();
            showUndo(
                next === "ARCHIVED"
                    ? `Archived ${product.name}.`
                    : next === "PUBLISHED"
                      ? `${product.name} is live.`
                      : `${product.name} is a draft.`,
                async () => {
                    const back = await runAction(
                        () => setProductStatus(product.id, was),
                        { quiet: true },
                    );
                    if (!back) return { ok: false, error: UNREACHED };
                    router.refresh();
                    return back;
                },
            );
        });
    }

    return { pending, setStatus };
}
