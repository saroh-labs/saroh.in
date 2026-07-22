"use client";

import { Button } from "@saroh/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@saroh/ui/card";
import { Check } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { setModuleStatusAction } from "@/lib/modules/actions";
import type { ModuleView } from "@/lib/modules/schema";

/**
 * Need-based module onboarding (#119). Asks what the business needs to *do* —
 * not how big it is — and turns each choice into an enabled module. Dependencies
 * come from the server-owned read model (`view.dependencies`), so the client
 * never hardcodes the capability graph: picking "Take appointments" enables its
 * prerequisites first. Skipping is fine and lands in Settings → Modules.
 */
interface Goal {
    moduleKey: string;
    title: string;
    description: string;
}

const GOALS: Goal[] = [
    {
        moduleKey: "WEBSITE",
        title: "Show up online",
        description:
            "Publish a website with pages, forms, and your own domain.",
    },
    {
        moduleKey: "CRM",
        title: "Manage customers & leads",
        description: "Capture enquiries and track them through a pipeline.",
    },
    {
        moduleKey: "APPOINTMENTS",
        title: "Take appointments",
        description: "Offer services and let customers book time with you.",
    },
    {
        moduleKey: "COMMERCE",
        title: "Sell products",
        description: "Run a catalog, take orders, and manage inventory.",
    },
    {
        moduleKey: "PAYMENTS",
        title: "Take payments",
        description: "Connect a provider to get paid for bookings and orders.",
    },
    {
        moduleKey: "COMMUNICATIONS",
        title: "Message customers",
        description: "Send messages and follow-ups with consent tracking.",
    },
    {
        moduleKey: "AUTOMATIONS",
        title: "Automate follow-ups",
        description: "Trigger actions automatically as work comes in.",
    },
    {
        moduleKey: "INSIGHTS",
        title: "See performance",
        description: "Track views, enquiries, and sales over time.",
    },
];

export function ModuleGoalPicker({ modules }: { modules: ModuleView[] }) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const byKey = useMemo(
        () => new Map(modules.map((m) => [m.key, m])),
        [modules],
    );
    const [enabled, setEnabled] = useState<Set<string>>(
        () =>
            new Set(
                modules
                    .filter((m) => m.lifecycle === "ENABLED")
                    .map((m) => m.key),
            ),
    );

    // Transitive server-owned dependency closure for a module.
    const withDeps = (moduleKey: string): string[] => {
        const order: string[] = [];
        const visit = (key: string) => {
            for (const dep of byKey.get(key)?.dependencies ?? []) visit(dep);
            if (!order.includes(key)) order.push(key);
        };
        visit(moduleKey);
        return order;
    };

    const enable = (goal: Goal) => {
        startTransition(async () => {
            for (const key of withDeps(goal.moduleKey)) {
                if (enabled.has(key)) continue;
                const result = await setModuleStatusAction(key, "ENABLED");
                if (!result.ok) {
                    toast.error(result.error);
                    return;
                }
                setEnabled((prev) => new Set(prev).add(key));
            }
            toast.success(`${goal.title} is ready`);
        });
    };

    return (
        <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
                {GOALS.filter((g) => byKey.has(g.moduleKey)).map((goal) => {
                    const isOn = enabled.has(goal.moduleKey);
                    return (
                        <Card key={goal.moduleKey}>
                            <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
                                <CardTitle className="text-base">
                                    {goal.title}
                                </CardTitle>
                                {isOn ? (
                                    <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
                                        <Check className="size-4" /> On
                                    </span>
                                ) : null}
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <p className="text-sm text-muted-foreground">
                                    {goal.description}
                                </p>
                                <Button
                                    variant={isOn ? "outline" : "brand"}
                                    disabled={pending || isOn}
                                    onClick={() => enable(goal)}
                                >
                                    {isOn ? "Enabled" : "Enable"}
                                </Button>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            <div className="flex items-center justify-between gap-4 border-t pt-6">
                <Button asChild variant="ghost">
                    <Link href="/settings/modules">Manage in Settings</Link>
                </Button>
                <Button variant="brand" onClick={() => router.push("/")}>
                    {enabled.size > 0 ? "Continue" : "Skip for now"}
                </Button>
            </div>
        </div>
    );
}
