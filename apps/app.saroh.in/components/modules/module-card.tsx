"use client";

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@saroh/ui/alert-dialog";
import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import {
    Card,
    CardContent,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@saroh/ui/card";
import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";

import { setModuleStatusAction } from "@/lib/modules/actions";
import type { ModuleView } from "@/lib/modules/schema";

import { ModuleSetupChecklist } from "./module-setup-checklist";

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

/** Human state label + badge styling derived from lifecycle + readiness. */
function stateOf(module: ModuleView): { label: string; variant: BadgeVariant } {
    if (module.lifecycle === "ARCHIVED")
        return { label: "Archived", variant: "outline" };
    if (module.lifecycle === "DISABLED")
        return { label: "Disabled", variant: "outline" };
    switch (module.readiness) {
        case "ACTIVE":
            return { label: "Active", variant: "default" };
        case "SETUP_REQUIRED":
            return { label: "Setup required", variant: "secondary" };
        case "ATTENTION_REQUIRED":
            return { label: "Attention required", variant: "destructive" };
        default:
            return { label: "Enabled", variant: "secondary" };
    }
}

/**
 * One module in the Settings → Modules catalog. Shows its state and exactly one
 * dominant next action for a manager: Enable when off; Finish setup (deep-link)
 * when enabled-but-incomplete; Disable (behind a confirm that explains data is
 * preserved and the safe-guard 409 blockers if any) when active. A read-only
 * viewer sees state without controls.
 */
export function ModuleCard({ module }: { module: ModuleView }) {
    const [pending, startTransition] = useTransition();
    const state = stateOf(module);
    const isEnabled = module.lifecycle === "ENABLED";

    const run = (
        status: "ENABLED" | "DISABLED" | "ARCHIVED",
        successMessage: string,
    ) => {
        startTransition(async () => {
            const result = await setModuleStatusAction(module.key, status);
            if (result.ok) {
                toast.success(successMessage);
            } else {
                const detail = result.blockers?.[0]?.message ?? result.error;
                toast.error(detail);
            }
        });
    };

    const setupBlocker = isEnabled ? module.blockers[0] : undefined;

    return (
        <Card className="wk-surface h-full">
            <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
                <CardTitle className="text-base">{module.label}</CardTitle>
                <Badge variant={state.variant}>{state.label}</Badge>
            </CardHeader>

            {isEnabled && module.blockers.length > 0 ? (
                <CardContent className="pt-0">
                    <ModuleSetupChecklist blockers={module.blockers} />
                </CardContent>
            ) : module.lifecycle === "DISABLED" ? (
                <CardContent className="pt-0">
                    <p className="text-sm text-muted-foreground">
                        Off. Enabling it restores its workspace; history is
                        never deleted.
                    </p>
                </CardContent>
            ) : null}

            {module.canManage ? (
                <CardFooter className="gap-2">
                    {module.lifecycle !== "ENABLED" ? (
                        <Button
                            variant="brand"
                            className="wk-press"
                            disabled={pending}
                            onClick={() =>
                                run("ENABLED", `${module.label} enabled`)
                            }
                        >
                            Enable
                        </Button>
                    ) : (
                        <>
                            {setupBlocker?.actionHref ? (
                                <Button
                                    asChild
                                    variant="brand"
                                    className="wk-press"
                                >
                                    <Link href={setupBlocker.actionHref}>
                                        Finish setup
                                    </Link>
                                </Button>
                            ) : null}
                            <DisableDialog
                                label={module.label}
                                pending={pending}
                                onConfirm={() =>
                                    run("DISABLED", `${module.label} disabled`)
                                }
                            />
                        </>
                    )}
                </CardFooter>
            ) : null}
        </Card>
    );
}

function DisableDialog({
    label,
    pending,
    onConfirm,
}: {
    label: string;
    pending: boolean;
    onConfirm: () => void;
}) {
    return (
        <AlertDialog>
            <AlertDialogTrigger asChild>
                <Button variant="outline" disabled={pending}>
                    Disable
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Disable {label}?</AlertDialogTitle>
                    <AlertDialogDescription>
                        New activity stops and {label} leaves the navigation.
                        Existing data is preserved and you can re-enable it any
                        time. If public or financial work is still in progress,
                        the change is refused until it&apos;s safe.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Keep enabled</AlertDialogCancel>
                    <AlertDialogAction onClick={onConfirm}>
                        Disable
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
