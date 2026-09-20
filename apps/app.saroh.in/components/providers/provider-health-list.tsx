import type { BadgeProps } from "@saroh/ui/badge";
import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
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
        action: string;
        urgent: boolean;
    }
> = {
    ACTIVE: {
        label: "Connected",
        variant: "success",
        action: "Manage",
        urgent: false,
    },
    PENDING: {
        label: "Connecting",
        variant: "info",
        action: "Manage",
        urgent: false,
    },
    DEGRADED: {
        label: "Not working",
        variant: "warning",
        action: "Fix",
        urgent: true,
    },
    FAILED: {
        label: "Not working",
        variant: "error",
        action: "Fix",
        urgent: true,
    },
    NOT_CONFIGURED: {
        label: "Not connected",
        variant: "neutral",
        action: "Set up",
        urgent: true,
    },
};

/**
 * Providers, as the workspace design draws a list: one bordered card, a row
 * each, the state on the right.
 *
 * It was a grid of cards, and three cards is where that stops working — each
 * one repeated the same two controls at card size for a single line of text,
 * and a merchant scanning for "is anything wrong?" had to read three headings
 * to find three pills. In a column the pills line up and the answer is one
 * glance down the right-hand edge.
 *
 * Never renders credentials — the API only ever returns status + safe copy.
 */
export function ProviderHealthList({ health }: { health: ProviderHealth[] }) {
    return (
        <>
            <div className="overflow-hidden rounded-[12px] border border-border">
                {health.map((h) => {
                    const status = STATUS[h.status];
                    return (
                        <div
                            key={h.key}
                            className="flex flex-wrap items-center gap-3 border-b border-foreground/10 px-4 py-3 last:border-b-0"
                        >
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-[13.5px] font-medium">
                                        {h.label}
                                    </span>
                                    <Badge variant={status.variant}>
                                        {status.label}
                                    </Badge>
                                </div>
                                <p className="mt-[2px] text-pretty text-[11.5px] leading-[1.45] text-muted-foreground">
                                    {h.message}
                                </p>
                            </div>
                            <Button
                                asChild
                                variant={status.urgent ? "brand" : "outline"}
                                size="sm"
                            >
                                {/*
                                 * The visible label stays short, but the
                                 * ACCESSIBLE name says which provider it acts
                                 * on. Three rows offering three links whose
                                 * entire accessible name is "Fix" is exactly
                                 * what WCAG 2.4.4 fails: a screen-reader user
                                 * listing the page's links hears the same word
                                 * three times with nothing to choose between.
                                 */}
                                <Link
                                    href={h.actionHref}
                                    aria-label={`${status.action} ${h.label}`}
                                >
                                    {status.action}
                                </Link>
                            </Button>
                        </div>
                    );
                })}
            </div>
            <p className="mt-2.5 max-w-[68ch] text-pretty text-[11.5px] leading-[1.45] text-muted-foreground">
                Providers are set up per business. A storefront can point its
                checkout at a different payment provider, and that choice lives
                under Sell rather than here.
            </p>
        </>
    );
}
