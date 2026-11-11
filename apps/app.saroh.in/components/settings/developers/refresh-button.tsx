"use client";

import { Button } from "@saroh/ui/button";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

/** Reads Usage again: this minute's counts move on their own. */
export function RefreshButton() {
    const router = useRouter();
    const [pending, start] = useTransition();
    return (
        <Button
            variant="outline"
            size="sm"
            busy={pending}
            busyLabel="Refreshing…"
            onClick={() => start(() => router.refresh())}
        >
            Refresh
        </Button>
    );
}
