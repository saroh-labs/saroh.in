import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@saroh/ui/card";
import Link from "next/link";

import type { HomeAction, HomeSeverity } from "@/lib/home/service";

/**
 * Severity reads as colour before it reads as a word.
 *
 * Mapped to tokens, not to shadcn badge variants: `variant="default"` resolves
 * to `--primary`, which in the Panel and Instrument skins is the LUMINOUS
 * ACTION colour — so "Overdue" rendered green, directly contradicting the rule
 * the skins are built on (green means you can act, amber means someone is
 * waiting). A semantic label must name its own colour rather than inherit
 * whatever a generic variant happens to point at.
 */
const SEVERITY: Record<HomeSeverity, { label: string; className: string }> = {
    ATTENTION: {
        label: "Attention",
        className: "bg-highlight text-highlight-foreground",
    },
    OVERDUE: {
        label: "Overdue",
        className: "bg-warning text-warning-foreground",
    },
    SETUP: {
        label: "Setup",
        className: "bg-secondary text-secondary-foreground",
    },
    SUGGESTION: {
        label: "Suggested",
        className: "border-border text-muted-foreground border bg-transparent",
    },
};

/**
 * The ranked next-actions surface for Home (#119). The single highest-severity
 * action is the page's one dominant call to action; the rest follow as a calm
 * list. Every item is a real destination — never a failing form.
 */
export function NextActions({
    primary,
    rest,
}: {
    primary: HomeAction;
    rest: HomeAction[];
}) {
    return (
        <div className="space-y-6">
            <Card>
                <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
                    <CardTitle className="text-base">Do this next</CardTitle>
                    <Badge className={SEVERITY[primary.severity].className}>
                        {SEVERITY[primary.severity].label}
                    </Badge>
                </CardHeader>
                <CardContent className="flex items-center justify-between gap-4">
                    <p className="text-sm">{primary.title}</p>
                    <Button asChild variant="brand">
                        <Link href={primary.href}>Go</Link>
                    </Button>
                </CardContent>
            </Card>

            {rest.length > 0 ? (
                <ul className="divide-y rounded-lg border">
                    {rest.map((action) => (
                        <li
                            key={action.code}
                            className="flex items-center justify-between gap-4 p-4"
                        >
                            <div className="flex items-center gap-3">
                                <Badge
                                    className={
                                        SEVERITY[action.severity].className
                                    }
                                >
                                    {SEVERITY[action.severity].label}
                                </Badge>
                                <span className="text-sm">{action.title}</span>
                            </div>
                            <Button asChild variant="ghost" size="sm">
                                <Link href={action.href}>Open</Link>
                            </Button>
                        </li>
                    ))}
                </ul>
            ) : null}
        </div>
    );
}
