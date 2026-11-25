"use client";

import { Button } from "@saroh/ui/button";

import { useUsageScreen } from "@/lib/api-keys/use-api-keys";

/** Reads Usage again: this minute's counts move on their own. */
export function RefreshButton() {
    const { refetch, isFetching } = useUsageScreen();
    return (
        <Button
            variant="outline"
            size="sm"
            busy={isFetching}
            busyLabel="Refreshing…"
            onClick={() => void refetch()}
        >
            Refresh
        </Button>
    );
}
