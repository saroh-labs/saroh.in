import type { BadgeProps } from "@saroh/ui/badge";
import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@saroh/ui/card";
import Link from "next/link";

import type {
    HealthStatus,
    ProviderHealth,
} from "@/lib/provider-health/service";

/**
 * State → what to call it, and what the button offers to do about it.
 *
 * The verb used to be "Fix" for all three unhealthy states, which was false for
 * two of them: nothing is broken about a provider nobody has connected yet, and
 * telling a merchant on day one that something needs fixing is the product
 * accusing itself. "Set up" is what NOT_CONFIGURED actually needs.
 *
 * Colours map to tokens rather than badge variants for the reason established
 * across the workspace: `variant="default"` resolves to `--primary`, the
 * luminous ACTION colour in two of the three skins, so "Active" was competing
 * with the button beside it; and `destructive` on a provider that has merely
 * gone quiet overstates a recoverable state.
 */
const STATUS: Record<
    HealthStatus,
    {
        label: string;
        variant: NonNullable<BadgeProps["variant"]>;
        action: string | null;
    }
> = {
    ACTIVE: {
        label: "Connected",
        variant: "success",
        action: "Manage",
    },
    PENDING: {
        label: "Connecting",
        variant: "info",
        action: "Manage",
    },
    DEGRADED: {
        label: "Not working",
        variant: "warning",
        action: "Fix",
    },
    FAILED: {
        label: "Not working",
        variant: "error",
        action: "Fix",
    },
    NOT_CONFIGURED: {
        label: "Not connected",
        variant: "neutral",
        action: "Set up",
    },
};

/**
 * One dependency's health (#123). Shows the state and a single recovery action.
 * Never renders credentials — the API only ever returns status + safe copy.
 */
export function ProviderHealthCard({ health }: { health: ProviderHealth }) {
    const status = STATUS[health.status];
    const needsAction =
        health.status === "DEGRADED" ||
        health.status === "FAILED" ||
        health.status === "NOT_CONFIGURED";

    return (
        <Card>
            <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
                <CardTitle className="text-base">{health.label}</CardTitle>
                <Badge variant={status.variant}>{status.label}</Badge>
            </CardHeader>
            <CardContent className="flex items-center justify-between gap-4">
                <p className="text-sm text-muted-foreground">
                    {health.message}
                </p>
                <Button
                    asChild
                    variant={needsAction ? "brand" : "outline"}
                    size="sm"
                >
                    {/*
                     * The visible label stays short, but the ACCESSIBLE name
                     * says which provider it acts on. Three cards on this page
                     * previously offered three links whose entire accessible
                     * name was "Fix" — WCAG 2.4.4 fails on exactly that, and a
                     * screen-reader user listing the page's links heard the same
                     * word three times with nothing to choose between them.
                     */}
                    <Link
                        href={health.actionHref}
                        aria-label={`${status.action} ${health.label}`}
                    >
                        {status.action}
                    </Link>
                </Button>
            </CardContent>
        </Card>
    );
}
