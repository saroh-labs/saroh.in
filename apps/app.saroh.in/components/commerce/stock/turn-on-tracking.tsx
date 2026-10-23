"use client";

import { Button } from "@saroh/ui/button";
import { showSuccess } from "@saroh/ui/toast";
import { PackageCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm/confirm-dialog";
import { setBusinessStockTracking } from "@/lib/stock/screen-actions";

/**
 * Turn Track stock on for the whole business (`store:write`, #515). It
 * asks first: every shelf starts at 0, so everything reads Sold out until
 * it is counted.
 */
export function TurnOnTracking() {
    const router = useRouter();
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
                    const res = await setBusinessStockTracking(true);
                    if (!res.ok) return { ok: false, error: res.error };
                    showSuccess(
                        "Track stock turned on.",
                        "Every shelf starts at 0. Count them to start selling.",
                    );
                    router.refresh();
                }}
            />
        </>
    );
}
