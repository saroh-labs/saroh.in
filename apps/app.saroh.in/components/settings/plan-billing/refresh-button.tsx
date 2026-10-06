"use client";

import { Button } from "@saroh/ui/button";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

/** "Try again" on a card whose read failed: reads the page again, in place. */
export function RefreshButton({ label = "Try again" }: { label?: string }) {
    const router = useRouter();
    const [pending, start] = useTransition();
    return (
        <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => start(() => router.refresh())}
        >
            {pending ? "Trying again…" : label}
        </Button>
    );
}
