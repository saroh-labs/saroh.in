"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { Switch } from "@saroh/ui/switch";
import { showError, showSuccess, showUndo } from "@saroh/ui/toast";
import Link from "next/link";
import { useId, useTransition } from "react";

import { navRowsForModule } from "@/components/shared/nav-items";
import { setModuleStatusAction } from "@/lib/modules/actions";
import type { ModuleView } from "@/lib/modules/schema";

import { ModuleSetupChecklist } from "./module-setup-checklist";

/**
 * Settings → Modules, as the workspace design draws it: one list, one switch a
 * row, and under each name the rows it puts in the rail.
 *
 * It was a grid of cards with Enable and Disable buttons, and disabling opened
 * a confirmation dialog. The brand system's rule decides both: turning a module
 * off is entirely reversible — nothing is deleted — so it takes UNDO, not a
 * confirmation. A dialog in front of a reversible change trains people to
 * dismiss dialogs, which is what makes the irreversible ones dangerous.
 *
 * What the toast says is the other half. "Commerce off" tells a merchant
 * nothing; "Sell, Storefronts and Products have left the rail" tells them
 * exactly what changed, and the rows are read from the nav itself so the
 * sentence cannot drift from what the rail does.
 */
export function ModuleList({ modules }: { modules: ModuleView[] }) {
    const canManage = modules.some((m) => m.canManage);
    return (
        <>
            {/*
             * `border-border`, not a palette grey. This card carried
             * `border-neutral-300` — one of Tailwind's stock neutrals, which
             * has no dark value — so in dark mode a near-white #D4D4D4 line
             * was drawn round a card whose own row dividers were correctly
             * dark. Every `neutral-*` used for TEXT in this codebase is
             * paired with a `dark:` override; these borders never were.
             */}
            <div className="overflow-hidden rounded-[12px] border border-border">
                {[...modules].sort(byAttentionFirst).map((module) => (
                    <ModuleRow key={module.key} module={module} />
                ))}
            </div>
            <p className="mt-2.5 max-w-[68ch] text-pretty text-[11.5px] leading-[1.45] text-muted-foreground">
                {canManage
                    ? "Turning one off removes its rows from the rail at once. Nothing is deleted — the data waits for it to come back on."
                    : // Shown disabled rather than hidden: knowing what this
                      // business runs on is part of working here, even for
                      // someone who cannot change it.
                      "Your role can see what this business runs on but not change it."}
            </p>
        </>
    );
}

/** What needs a person first, then what is running, then what is not on. */
function byAttentionFirst(a: ModuleView, b: ModuleView): number {
    return rank(a) - rank(b);
}

function rank(module: ModuleView): number {
    if (module.lifecycle === "ARCHIVED") return 5;
    if (module.lifecycle === "DISABLED") return 4;
    if (module.readiness === "ATTENTION_REQUIRED") return 0;
    if (module.readiness === "SETUP_REQUIRED") return 1;
    return 2;
}

function ModuleRow({ module }: { module: ModuleView }) {
    const [pending, startTransition] = useTransition();
    const labelId = useId();
    const noteId = useId();
    const on = module.lifecycle === "ENABLED";
    const rows = navRowsForModule(module.key);
    const setupBlocker = on ? module.blockers[0] : undefined;

    const set = (next: "ENABLED" | "DISABLED", onDone: () => void) => {
        startTransition(async () => {
            const result = await setModuleStatusAction(module.key, next);
            if (result.ok) {
                onDone();
            } else {
                // A refusal is the safe-guard talking (public or financial work
                // still in progress). Say what it said — the switch springing
                // back with no reason is the worst version of this.
                showError(result.blockers?.[0]?.message ?? result.error);
            }
        });
    };

    const flip = () => {
        if (!module.canManage || pending) return;
        if (on) {
            set("DISABLED", () =>
                showUndo(
                    `${module.label} off — ${listRows(rows)} ${rows.length === 1 ? "has" : "have"} left the rail. Nothing is deleted.`,
                    () => set("ENABLED", () => undefined),
                ),
            );
        } else {
            set("ENABLED", () =>
                showSuccess(
                    `${module.label} on — ${listRows(rows)} ${rows.length === 1 ? "is" : "are"} in the rail now.`,
                ),
            );
        }
    };

    return (
        <div
            onClick={(e) => {
                // The whole row is the target, but the switch is its own
                // control: without this the click would toggle twice.
                if ((e.target as HTMLElement).closest("[role=switch]")) return;
                flip();
            }}
            className={cn(
                "flex items-center gap-3 border-b border-foreground/10 px-[18px] py-[13px] last:border-b-0",
                module.canManage
                    ? "cursor-pointer transition-colors duration-fast hover:bg-accent"
                    : "cursor-not-allowed",
            )}
        >
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                    <span id={labelId} className="text-[13.5px] font-medium">
                        {module.label}
                    </span>
                    <StateTag module={module} />
                </div>
                <p
                    id={noteId}
                    className="mt-[3px] text-pretty text-[11.5px] leading-[1.45] text-muted-foreground"
                >
                    {rows.length > 0
                        ? `${listRows(rows)} in the rail.`
                        : "Works behind the other rows rather than adding one of its own."}
                </p>
                {setupBlocker && module.blockers.length > 0 ? (
                    <div className="mt-2">
                        <ModuleSetupChecklist blockers={module.blockers} />
                        {setupBlocker.actionHref ? (
                            <Button
                                asChild
                                variant="outline"
                                size="sm"
                                className="mt-2"
                            >
                                <Link href={setupBlocker.actionHref}>
                                    Finish setup
                                </Link>
                            </Button>
                        ) : null}
                    </div>
                ) : null}
            </div>
            <Switch
                checked={on}
                disabled={!module.canManage || pending}
                onCheckedChange={flip}
                aria-labelledby={labelId}
                aria-describedby={noteId}
            />
        </div>
    );
}

function StateTag({ module }: { module: ModuleView }) {
    if (module.lifecycle === "ARCHIVED") {
        return <Badge variant="neutral">Archived</Badge>;
    }
    if (module.lifecycle === "ENABLED") {
        if (module.readiness === "ATTENTION_REQUIRED") {
            return <Badge variant="error">Needs attention</Badge>;
        }
        if (module.readiness === "SETUP_REQUIRED") {
            return <Badge variant="warning">Finish setup</Badge>;
        }
    }
    if (!module.canManage) return <Badge variant="neutral">Read only</Badge>;
    return null;
}

/** "Sell, Storefronts and Products" — a sentence, not a comma-separated dump. */
function listRows(rows: string[]): string {
    if (rows.length === 0) return "its rows";
    if (rows.length === 1) return rows[0] ?? "its rows";
    return `${rows.slice(0, -1).join(", ")} and ${rows[rows.length - 1]}`;
}
