"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { showError, showSuccess, showUndo } from "@saroh/ui/toast";
import Link from "next/link";
import { useEffect, useId, useRef, useState, useTransition } from "react";

import { navRowsForModule } from "@/components/shared/nav-items";
import { setModuleStatusAction } from "@/lib/modules/actions";
import type { ModuleView } from "@/lib/modules/schema";
import {
    enabledDependents,
    listWords,
    missingDependencies,
    offImpact,
    setupActionLabel,
} from "@/lib/modules/switch-plan";

/**
 * Settings → Modules ("Saroh Settings" design): one bordered list, a switch
 * a row, and under each name what it is for.
 *
 * Turning a module off is entirely reversible — nothing is deleted — so it
 * takes UNDO, and never a modal. Where it changes something a person would
 * miss, the row asks first, in place ("Turn off Appointments? Courses turns
 * off with it…", Turn off / Keep it on, focus on Keep): the consequence is
 * read at the moment it matters instead of sitting under every switch. What
 * it says is the point: "Sell off" tells a merchant nothing; "Orders,
 * Products and Customers leave the rail" tells them exactly what changes,
 * and the rows are read from the nav itself so the sentence cannot drift
 * from what the rail does. A module with nothing to say goes off at once.
 */
export function ModuleList({ modules }: { modules: ModuleView[] }) {
    const canManage = modules.some((m) => m.canManage);
    return (
        <div className="max-w-[760px]">
            <div className="overflow-hidden rounded-xl border border-border bg-card">
                {[...modules].sort(byAttentionFirst).map((module, i) => (
                    <ModuleRow
                        key={module.key}
                        module={module}
                        modules={modules}
                        first={i === 0}
                    />
                ))}
            </div>
            <p className="mt-2.5 text-pretty text-[11.5px] leading-normal text-muted-foreground">
                {canManage
                    ? "Turning one off removes its section from the rail at once. Nothing is deleted — the data waits for it to come back on."
                    : // Shown disabled rather than hidden: knowing what this
                      // business runs on is part of working here, even for
                      // someone who cannot change it.
                      "Your role can see what this business runs on but not change it. The switches are shown, not hidden, because knowing is part of working here."}
            </p>
        </div>
    );
}

/**
 * What each module is called here and what it is for, from the design. The
 * names are the rail's — the API says "Commerce" and "CRM", but a merchant
 * turns on the Sell and Contacts they see in the sidebar. A module the design
 * does not describe keeps the API's name and the rows it adds.
 */
const DISPLAY: Partial<Record<string, { label?: string; note: string }>> = {
    CRM: { label: "Contacts", note: "People who are not customers yet." },
    COMMERCE: {
        label: "Sell",
        note: "Orders, products, customers and storefronts.",
    },
    PAYMENTS: { note: "Take subscriptions, send invoices and sell plans." },
    WEBSITE: { note: "Pages, posts and a domain." },
    APPOINTMENTS: { note: "A calendar, services and bookings." },
    COURSES: { note: "A run of dated sessions with seats and a price." },
    COMMUNICATIONS: {
        note: "Email and WhatsApp to your customers and leads. Works in the background — no new menu item.",
    },
    AUTOMATIONS: {
        note: "Follow-ups that run on their own. No new menu item.",
    },
    INSIGHTS: { note: "Figures across whatever else is turned on." },
};

function labelOf(modules: ModuleView[], key: string): string {
    return (
        DISPLAY[key]?.label ?? modules.find((m) => m.key === key)?.label ?? key
    );
}

function noteOf(modules: ModuleView[], module: ModuleView): string {
    const rows = navRowsForModule(module.key);
    const note =
        DISPLAY[module.key]?.note ??
        (rows.length > 0
            ? `${listWords(rows)} in the rail.`
            : "Works in the background — no new menu item.");
    // "Needs Appointments." from the API's dependencies, not the copy, so
    // it is said of every module that has one.
    const needs = module.dependencies.map((d) => labelOf(modules, d));
    return needs.length > 0 ? `${note} Needs ${listWords(needs)}.` : note;
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

function ModuleRow({
    module,
    modules,
    first,
}: {
    module: ModuleView;
    modules: ModuleView[];
    first: boolean;
}) {
    const [pending, startTransition] = useTransition();
    const [asking, setAsking] = useState(false);
    const keepRef = useRef<HTMLButtonElement>(null);
    const rowRef = useRef<HTMLDivElement>(null);
    const labelId = useId();
    const noteId = useId();
    // Asking moves focus to "Keep it on" — the safe answer, as the design
    // has it — so Enter or Space never turns a module off by accident.
    useEffect(() => {
        if (asking) keepRef.current?.focus();
    }, [asking]);
    const on = module.lifecycle === "ENABLED";
    const label = labelOf(modules, module.key);

    // Off, and something it needs is off too: the switch waits for that.
    const missing = on ? [] : missingDependencies(modules, module.key);
    const blocked = missing.length > 0;
    const missingLabels = missing.map((k) => labelOf(modules, k));
    // On, and other modules need it: they go off with it.
    const dependents = on ? enabledDependents(modules, module.key) : [];
    const dependentLabels = dependents.map((k) => labelOf(modules, k));
    const leaving = [module.key, ...dependents].flatMap((k) =>
        navRowsForModule(k),
    );

    const impact =
        on && module.canManage
            ? offImpact({ rows: leaving, dependents: dependentLabels })
            : null;
    // The step the API says is left, for a module that is on.
    const step =
        on && module.readiness !== "ACTIVE" ? module.blockers[0] : undefined;
    const stepAction = step?.actionHref ? setupActionLabel(step.code) : null;

    /**
     * Apply changes one module at a time, in the order given — the API
     * checks dependencies on every call, so the order is the plan's.
     */
    const run = (
        changes: [string, "ENABLED" | "DISABLED"][],
        onDone: () => void,
    ) => {
        startTransition(async () => {
            for (const [key, status] of changes) {
                const result = await setModuleStatusAction(key, status);
                if (!result.ok) {
                    // A refusal is the safe-guard talking (open orders, say).
                    // Say what it said — the switch springing back with no
                    // reason is the worst version of this.
                    showError(result.blockers?.[0]?.message ?? result.error);
                    return;
                }
            }
            onDone();
        });
    };

    const turnOn = (keys: string[]) => {
        const names = keys.map((k) => labelOf(modules, k));
        const rows = keys.flatMap((k) => navRowsForModule(k));
        run(
            keys.map((k) => [k, "ENABLED"]),
            () =>
                showSuccess(
                    `${listWords(names)} ${keys.length > 1 ? "are" : "is"} on${rows.length > 0 ? ` — ${listWords(rows)} ${rows.length === 1 ? "is" : "are"} in the rail now` : ""}.`,
                ),
        );
    };

    const turnOff = () => {
        setAsking(false);
        // Off: what needs it first, then the module itself.
        const offOrder = [...dependents, module.key];
        run(
            offOrder.map((k) => [k, "DISABLED"]),
            () =>
                showUndo(
                    `${label} off${dependentLabels.length > 0 ? `, and ${listWords(dependentLabels)} with it` : ""}${leaving.length > 0 ? ` — ${listWords(leaving)} ${leaving.length === 1 ? "has" : "have"} left the rail` : ""}. Nothing is deleted.`,
                    // Undo in the order the API accepts: needed before needing.
                    () =>
                        run(
                            [...offOrder].reverse().map((k) => [k, "ENABLED"]),
                            () => undefined,
                        ),
                ),
        );
    };

    const flip = () => {
        if (!module.canManage || blocked || pending) return;
        if (!on) return turnOn([module.key]);
        // A second press while asking is the answer "yes".
        if (impact && !asking) return setAsking(true);
        turnOff();
    };

    const keepOn = () => {
        setAsking(false);
        rowRef.current
            ?.querySelector<HTMLButtonElement>('[role="switch"]')
            ?.focus();
    };

    const locked = !module.canManage || blocked;

    return (
        <div
            ref={rowRef}
            className={cn(
                "flex items-center gap-3.5 px-[18px] py-3.5",
                !first && "border-t border-border/70",
                step && "bg-muted/50",
            )}
        >
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                    <span id={labelId} className="text-[13.5px] font-semibold">
                        {label}
                    </span>
                    <StateTag
                        module={module}
                        needs={blocked ? missingLabels.at(-1) : undefined}
                    />
                </div>
                <p
                    id={noteId}
                    className="mt-[3px] text-pretty text-[12px] leading-[1.45] text-muted-foreground"
                >
                    {noteOf(modules, module)}
                </p>
                {asking && impact ? (
                    <div
                        role="alert"
                        onKeyDown={(e) => {
                            if (e.key === "Escape") keepOn();
                        }}
                        className="mt-2.5 grid gap-2 rounded-[9px] border border-highlight-border bg-brand-subtle px-3 py-2.5"
                    >
                        <p className="text-pretty text-[12.5px] leading-[1.45] text-foreground">
                            <strong>Turn off {label}?</strong> {impact}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                            <Button
                                type="button"
                                size="sm"
                                disabled={pending}
                                onClick={turnOff}
                            >
                                Turn off
                            </Button>
                            <Button
                                ref={keepRef}
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={keepOn}
                            >
                                Keep it on
                            </Button>
                        </div>
                    </div>
                ) : null}
                {blocked && module.canManage ? (
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-2"
                        disabled={pending}
                        onClick={() => turnOn([...missing, module.key])}
                    >
                        Turn on {listWords([...missingLabels, label])}
                    </Button>
                ) : null}
                {step ? (
                    <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
                        <span className="text-[12.5px] text-foreground/80">
                            {step.message ?? step.code}
                        </span>
                        {stepAction && step.actionHref && module.canManage ? (
                            <Button asChild variant="outline" size="sm">
                                <Link href={step.actionHref}>{stepAction}</Link>
                            </Button>
                        ) : null}
                    </div>
                ) : null}
            </div>
            <ModuleSwitch
                on={on}
                locked={locked}
                busy={pending}
                onFlip={flip}
                labelledBy={labelId}
                describedBy={noteId}
                why={
                    blocked
                        ? `turn on ${listWords(missingLabels)} first`
                        : !module.canManage
                          ? "you can't change this"
                          : undefined
                }
            />
        </div>
    );
}

/**
 * The design's switch: a 42 × 24 track, ink when on, and a paler ink when
 * it is on but locked. `aria-disabled` rather than `disabled`, so a locked
 * switch can still be reached and says why it will not move.
 */
function ModuleSwitch({
    on,
    locked,
    busy,
    onFlip,
    labelledBy,
    describedBy,
    why,
}: {
    on: boolean;
    locked: boolean;
    busy: boolean;
    onFlip: () => void;
    labelledBy: string;
    describedBy: string;
    why?: string;
}) {
    const whyId = useId();
    return (
        <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-disabled={locked || busy}
            aria-busy={busy || undefined}
            aria-labelledby={why ? `${labelledBy} ${whyId}` : labelledBy}
            aria-describedby={describedBy}
            onClick={onFlip}
            className={cn(
                "shrink-0 rounded-full p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                locked ? "cursor-not-allowed" : "cursor-pointer",
                locked && !on && "opacity-50",
                busy && "cursor-progress",
            )}
        >
            {why ? (
                <span id={whyId} className="sr-only">
                    , {why}
                </span>
            ) : null}
            <span
                className={cn(
                    "relative block h-6 w-[42px] rounded-full transition-colors duration-fast",
                    on
                        ? locked
                            ? "bg-muted-foreground/50"
                            : "bg-foreground"
                        : "bg-border",
                )}
            >
                <span
                    className={cn(
                        "absolute top-[3px] size-[18px] rounded-full bg-card transition-[left] duration-fast",
                        on ? "left-[21px]" : "left-[3px]",
                    )}
                />
            </span>
        </button>
    );
}

/**
 * The pills beside a name. "Finish setup" is the design's accent pill; the
 * rest are quiet. "Needs attention" stays: it is a real state (a provider
 * switched off under a module that is on) the design has no row for.
 */
function StateTag({ module, needs }: { module: ModuleView; needs?: string }) {
    const tag = (text: string, tone: "accent" | "quiet" | "error") => (
        <span
            className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.04em]",
                tone === "accent" &&
                    "bg-highlight-subtle text-highlight-subtle-foreground",
                tone === "quiet" && "bg-muted text-foreground/80",
                tone === "error" &&
                    "bg-destructive-subtle text-destructive-subtle-foreground",
            )}
        >
            {text}
        </span>
    );
    if (module.lifecycle === "ENABLED") {
        if (module.readiness === "ATTENTION_REQUIRED") {
            return tag("Needs attention", "error");
        }
        if (module.readiness === "SETUP_REQUIRED") {
            return tag("Finish setup", "accent");
        }
    }
    if (!module.canManage) return tag("Read only", "quiet");
    if (needs) return tag(`Needs ${needs}`, "quiet");
    if (module.lifecycle === "ARCHIVED") return tag("Archived", "quiet");
    return null;
}
