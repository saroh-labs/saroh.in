"use client";

import { Button } from "@saroh/ui/button";
import { showSuccess } from "@saroh/ui/toast";
import { useQueryClient } from "@tanstack/react-query";
import { PackageCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { productsKeys } from "@/lib/products/queries";
import { afterSettingsSave } from "@/lib/query/invalidate";
import { useOrgId } from "@/lib/query/org";
import { stockKeys } from "@/lib/stock/queries";
import { setBusinessStockTracking } from "@/lib/stock/screen-actions";
import { ConfirmDialog } from "@saroh/ui/confirm-dialog";

/**
 * Turn Track stock on for the whole business (`store:write`, #515). It
 * asks first: every shelf starts at 0, so everything reads Sold out until
 * it is counted.
 *
 * Once on, Stock and Products are marked stale (every shelf is now 0) and
 * the page is drawn once more: the gate that showed this state is the
 * server's (the rail's Stock row follows `afterSettingsSave()`).
 */
export function TurnOnTracking() {
    const router = useRouter();
    const qc = useQueryClient();
    const orgId = useOrgId();
    const [asking, setAsking] = useState(false);
    return (
        <>
            <Button
                type="button"
                className="mt-1.5"
                onClick={() => setAsking(true)}
            >
                Turn on Track stock
            </Button>
            <ConfirmDialog
                open={asking}
                onOpenChange={setAsking}
                icon={PackageCheck}
                tone="neutral"
                title="Turn on Track stock?"
                description="Every product starts at 0 on every shelf, so it reads Sold out until you count it. Count stock straight after, from this screen."
                confirmLabel="Turn on Track stock"
                keepLabel="Keep it off"
                onConfirm={async () => {
                    const res = await setBusinessStockTracking(true, orgId);
                    if (!res.ok) return { ok: false, error: res.error };
                    // The rail's Stock row.
                    afterSettingsSave();
                    showSuccess(
                        "Track stock turned on.",
                        "Every shelf starts at 0. Count them to start selling.",
                    );
                    const stale = { refetchType: "none" } as const;
                    await Promise.all([
                        qc.invalidateQueries({
                            queryKey: stockKeys(orgId),
                            ...stale,
                        }),
                        qc.invalidateQueries({
                            queryKey: productsKeys(orgId),
                            ...stale,
                        }),
                    ]);
                    // rq-refresh-ok: Track stock off is the Stock page's server gate; this draws the page once past it.
                    router.refresh();
                }}
            />
        </>
    );
}
