"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Refresh the page's server data on an interval while something is still
 * running, and stop the moment it is not. The page itself is the source of
 * truth; this only asks it again.
 */
export function AutoRefresh({
    active,
    everyMs = 2000,
}: {
    active: boolean;
    everyMs?: number;
}) {
    const router = useRouter();
    useEffect(() => {
        if (!active) return;
        const timer = setInterval(() => router.refresh(), everyMs);
        return () => clearInterval(timer);
    }, [active, everyMs, router]);
    return null;
}
