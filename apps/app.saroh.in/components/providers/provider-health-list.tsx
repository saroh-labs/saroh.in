import type { BadgeProps } from "@saroh/ui/badge";
import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import Link from "next/link";

import { ListCard, ListRow } from "@/components/shared/list-card";

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
 * Providers, as the workspace design draws the list: column headings, one row
 * each, and the state on the right where the eye can run down it. In a column
 * the pills line up, so "is anything wrong?" is one glance down the edge.
 *
 * Never renders credentials — the API only ever returns status + safe copy.
 */
export function ProviderHealthList({
    health,
    actionFor,
}: {
    health: ProviderHealth[];
    /**
     * The row's own control, where it has one — the payments and messaging
     * setup dialogs. A row without one keeps its link.
     */
    actionFor?: (
        h: ProviderHealth,
        action: { label: string; urgent: boolean },
    ) => React.ReactNode;
}) {
    return (
        <ListCard
            main="Provider"
            end="Status"
            note="Providers are set up per business. A storefront can point its checkout at a different payment provider, and that choice lives under Sell rather than here."
        >
            {health.map((h) => {
                const status = STATUS[h.status];
                return (
                    <li
                        key={h.key}
                        className="border-b border-border last:border-b-0"
                    >
                        <ListRow
                            title={h.label}
                            sub={h.message}
                            end={
                                <>
                                    <Badge variant={status.variant}>
                                        {status.label}
                                    </Badge>
                                    {actionFor?.(h, {
                                        label: status.action,
                                        urgent: status.urgent,
                                    }) ?? (
                                        <Button
                                            asChild
                                            variant={
                                                status.urgent
                                                    ? "brand"
                                                    : "outline"
                                            }
                                            size="sm"
                                        >
                                            {/*
                                             * The visible label stays short, but
                                             * the ACCESSIBLE name says which
                                             * provider it acts on — three links
                                             * all named "Fix" is what WCAG 2.4.4
                                             * fails.
                                             */}
                                            <Link
                                                href={h.actionHref}
                                                aria-label={`${status.action} ${h.label}`}
                                            >
                                                {status.action}
                                            </Link>
                                        </Button>
                                    )}
                                </>
                            }
                        />
                    </li>
                );
            })}
        </ListCard>
    );
}
