"use client";

import { Button } from "@saroh/ui/button";
import { FailedState } from "@saroh/ui/data-state";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

/**
 * `GET /admin/pricing` failed. No editor is drawn, so nothing can be saved
 * over the live pricing from a screen that never read it.
 */
export function PlansFailed() {
    const router = useRouter();
    const [pending, start] = useTransition();
    return (
        <FailedState
            title="Plans and modules could not be loaded"
            description="The pricing could not be read just now, so nothing is shown and nothing can be changed. Nothing has been changed."
            action={
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => start(() => router.refresh())}
                >
                    {pending ? "Trying…" : "Try again"}
                </Button>
            }
        />
    );
}
