import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@saroh/ui/card";
import Link from "next/link";

import type {
    HealthStatus,
    ProviderHealth,
} from "@/lib/provider-health/service";

const STATUS: Record<
    HealthStatus,
    {
        label: string;
        variant: "default" | "secondary" | "destructive" | "outline";
    }
> = {
    ACTIVE: { label: "Active", variant: "default" },
    PENDING: { label: "Pending", variant: "secondary" },
    DEGRADED: { label: "Degraded", variant: "destructive" },
    FAILED: { label: "Failed", variant: "destructive" },
    NOT_CONFIGURED: { label: "Not set up", variant: "outline" },
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
                    <Link href={health.actionHref}>
                        {needsAction ? "Fix" : "Manage"}
                    </Link>
                </Button>
            </CardContent>
        </Card>
    );
}
