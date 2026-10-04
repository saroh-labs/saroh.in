"use client";

import { Button } from "@saroh/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@saroh/ui/dialog";
import { showError } from "@saroh/ui/toast";
import Link from "next/link";
import { useEffect, useState } from "react";

import { upgradeHref } from "@/lib/billing/access";
import type { PlanRefusal } from "@/lib/billing/refusal";

/**
 * A write the business's plan refused, shown as the notice it is (plans
 * catalogue U14): the title, what stopped, and the way up — not the API's
 * message in a toast. One host in the shell; any screen calls
 * {@link reportFailure} with its action's result.
 */

type Listener = (refusal: PlanRefusal) => void;
const listeners = new Set<Listener>();

export function showPlanRefusal(refusal: PlanRefusal): void {
    // No host (a surface outside the shell): still the notice's words.
    if (listeners.size === 0) {
        showError(refusal.title, refusal.body || undefined);
        return;
    }
    listeners.forEach((l) => l(refusal));
}

/**
 * The failure of a write, said: the plan's notice when its plan refused it,
 * else the API's guarded message (or `fallback`) as a toast.
 */
export function reportFailure(
    res: { error: string; plan?: PlanRefusal },
    fallback?: string,
): void {
    if (res.plan) showPlanRefusal(res.plan);
    else showError(res.error || fallback || "That didn't work. Try again.");
}

export function PlanRefusalHost() {
    const [refusal, setRefusal] = useState<PlanRefusal | null>(null);
    useEffect(() => {
        listeners.add(setRefusal);
        return () => {
            listeners.delete(setRefusal);
        };
    }, []);

    const full = refusal?.code === "PLAN_LIMIT_REACHED";
    return (
        <Dialog
            open={refusal !== null}
            onOpenChange={(open) => {
                if (!open) setRefusal(null);
            }}
        >
            <DialogContent className="max-w-[440px]">
                <DialogHeader className="text-left">
                    <DialogTitle className="font-display text-[17px] font-semibold tracking-[-0.02em]">
                        {refusal?.title}
                    </DialogTitle>
                    <DialogDescription className="text-pretty text-[13px] leading-[1.55] text-foreground/80">
                        {refusal?.body}
                    </DialogDescription>
                </DialogHeader>
                {full && refusal?.limit ? (
                    <div
                        aria-hidden
                        className="h-[5px] overflow-hidden rounded-full bg-muted"
                    >
                        <div className="h-full w-full rounded-full bg-destructive" />
                    </div>
                ) : null}
                <DialogFooter className="gap-2 sm:space-x-0">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => setRefusal(null)}
                    >
                        Not now
                    </Button>
                    <Button asChild>
                        <Link
                            href={upgradeHref(refusal?.upgradeTo?.planId)}
                            onClick={() => setRefusal(null)}
                        >
                            {refusal?.cta ?? "See plans"}
                        </Link>
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
