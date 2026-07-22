import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@saroh/ui/card";
import Link from "next/link";

import type { HomeAction, HomeSeverity } from "@/lib/home/service";

const SEVERITY: Record<
    HomeSeverity,
    {
        label: string;
        variant: "default" | "secondary" | "destructive" | "outline";
    }
> = {
    ATTENTION: { label: "Attention", variant: "destructive" },
    SETUP: { label: "Setup", variant: "secondary" },
    OVERDUE: { label: "Overdue", variant: "default" },
    SUGGESTION: { label: "Suggested", variant: "outline" },
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
                    <Badge variant={SEVERITY[primary.severity].variant}>
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
                                    variant={SEVERITY[action.severity].variant}
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
