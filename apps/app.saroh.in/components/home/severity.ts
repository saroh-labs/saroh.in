import type { HomeSeverity } from "@/lib/home/service";

/**
 * Severity reads as colour before it reads as a word.
 *
 * Mapped to tokens, not to shadcn badge variants: `variant="default"` resolves
 * to `--primary`, which in the Panel and Instrument skins is the LUMINOUS
 * ACTION colour — so "Overdue" rendered green, directly contradicting the rule
 * the skins are built on (green means you can act, amber means someone is
 * waiting). A semantic label must name its own colour rather than inherit
 * whatever a generic variant happens to point at.
 *
 * `rail` is the same meaning at a different weight: a 2px edge on a block,
 * where a filled badge would shout. The pair is kept in one table so the two
 * can never disagree about what amber means.
 */
export const SEVERITY: Record<
    HomeSeverity,
    { label: string; badge: string; rail: string }
> = {
    ATTENTION: {
        label: "Attention",
        badge: "bg-highlight text-highlight-foreground",
        rail: "bg-highlight",
    },
    OVERDUE: {
        label: "Overdue",
        badge: "bg-warning text-warning-foreground",
        rail: "bg-warning",
    },
    SETUP: {
        label: "Setup",
        badge: "bg-secondary text-secondary-foreground",
        rail: "bg-muted-foreground/40",
    },
    SUGGESTION: {
        label: "Suggested",
        badge: "border-border text-muted-foreground border bg-transparent",
        rail: "bg-border",
    },
};
