"use client";

import { Button } from "@saroh/ui/button";
import { useTransition } from "react";

import { useSettingsSave } from "@/lib/settings/use-settings";

/**
 * "Try again" on a card whose read failed: reads the tab again, in place
 * (Plan and billing and Change plan are both on React Query).
 */
export function RefreshButton({ label = "Try again" }: { label?: string }) {
    const save = useSettingsSave();
    const [pending, start] = useTransition();
    return (
        <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => start(() => save.saved())}
            busy={pending}
            busyLabel="Trying again…"
        >
            {label}
        </Button>
    );
}
