"use client";

import { Button } from "@saroh/ui/button";
import { Skeleton } from "@saroh/ui/skeleton";

import type { ServicesLoad } from "./types";

/**
 * What a service picker shows until the org's services are in hand: loading,
 * a failed read with a retry, or no access. Shared by the booking and
 * services-list pickers so the two say the same thing. Renders nothing once
 * the read is ready; the picker takes over from there.
 */
export function ServicesLoadNotice({ load }: { load: ServicesLoad }) {
    if (load.status === "ready") return null;
    if (load.status === "loading") {
        return (
            <Skeleton
                className="h-9 w-full"
                aria-label="Loading your services"
            />
        );
    }
    if (load.forbidden) {
        return (
            <p className="text-sm text-muted-foreground">
                Your role can&apos;t see this organization&apos;s services, so
                they can&apos;t be chosen here.
            </p>
        );
    }
    return (
        <div className="grid gap-2">
            <p className="text-sm text-muted-foreground">
                We couldn&apos;t load your services. Nothing you chose has
                changed.
            </p>
            <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-fit"
                onClick={load.retry}
            >
                Try again
            </Button>
        </div>
    );
}
