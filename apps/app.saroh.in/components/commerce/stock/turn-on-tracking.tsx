"use client";

import { Button } from "@saroh/ui/button";
import { showError, showSuccess } from "@saroh/ui/toast";
import { PackageCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { setBusinessStockTracking } from "@/lib/stock/screen-actions";

/**
 * Turn Track stock on for the whole business (`store:write`, #515). It
 * asks first: every shelf starts at 0, so everything reads Sold out until
 * it is counted.
 */
export function TurnOnTracking() {
    const router = useRouter();
    const [asking, setAsking] = useState(false);
    const [pending, start] = useTransition();
    return (
        <>
            <Button
                type="button"
                className="mt-1.5 rounded-[9px] px-4 text-[12.5px]"
                disabled={pending}
                onClick={() => setAsking(true)}
            >
                {pending ? "Turning on…" : "Turn on Track stock"}
            </Button>
            <ConfirmDialog
                open={asking}
                onOpenChange={setAsking}
                icon={PackageCheck}
                title="Start counting stock?"
                description="Every product starts at 0 on every shelf, so it reads Sold out until you count it. Count stock straight after, from this screen."
                confirmLabel="Turn on Track stock"
                onConfirm={() =>
                    start(async () => {
                        const res = await setBusinessStockTracking(true);
                        if (!res.ok) {
                            showError(res.error);
                            return;
                        }
                        showSuccess(
                            "Saroh is counting stock now.",
                            "Every shelf starts at 0 — count them to start selling.",
                        );
                        router.refresh();
                    })
                }
            />
        </>
    );
}
