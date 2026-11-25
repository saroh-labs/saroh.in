"use client";

import { Button } from "@saroh/ui/button";
import { useTransition } from "react";

import { useSettingsRefresh } from "@/lib/settings/use-settings";

/**
 * "Try again" on a card whose read failed: reads the tab again, in place
 * (on a server-drawn screen, the page).
 */
export function RefreshButton({ label = "Try again" }: { label?: string }) {
    const refresh = useSettingsRefresh();
    const [pending, start] = useTransition();
    return (
        <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => start(refresh)}
            busy={pending}
            busyLabel="Trying again…"
        >
            {label}
        </Button>
    );
}
