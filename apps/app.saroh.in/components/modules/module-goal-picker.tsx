"use client";

import { Button } from "@saroh/ui/button";
import { Checkbox } from "@saroh/ui/checkbox";
import { Check } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { TurnOnSheet } from "@/components/modules/turn-on/turn-on-sheet";
import { rolledOutKeys } from "@/lib/modules/rollout";
import type { ModuleView } from "@/lib/modules/schema";
import { kindWords, preselect } from "@/lib/organizations/kind";

/**
 * Need-based module onboarding (#119). Asks what the business needs to *do* —
 * not how big it is — and turns each choice into an enabled module.
 *
 * Selection is LOCAL until the merchant confirms. The previous version fired a
 * server action per card and rendered each chosen card as a `disabled` button
 * labelled "Enabled", which made the screen a one-way door: a mis-click could
 * not be taken back, and a screen reader announced "Enabled, button, dimmed"
 * once per card — state communicated through a control role. Deferring the
 * commit makes reversibility a property of the design rather than a feature to
 * build, and lets the whole choice be described before anything happens.
 * Confirming opens one "Turn on" sheet for every pick (DEC-068), which asks
 * each module's minimum in one form and turns them on in order.
 *
 * Dependencies come from the server-owned read model (`view.dependencies`), so
 * the client never hardcodes the capability graph. They are also SHOWN: picking
 * "Take appointments" quietly enabling CRM is the kind of thing a merchant
 * should be told before it happens, not discover in the navigation afterwards.
 */
interface Goal {
    moduleKey: string;
    title: string;
    description: string;
}

/**
 * What is suggested follows what is being set up (DEC-070, `preselect` in
 * `lib/organizations/kind.ts`): for a business, commerce leads (product
 * decision 2026-08-02: commerce-led, not commerce-only), so selling is
 * offered first and pre-selected; a site for someone's work starts from the
 * website; "Just me" is suggested nothing, since its first job is often an
 * invoice, which needs no module. The suggestion moves to the top and
 * nothing else moves — the ordering states a default, it does not rank the
 * business models we serve, and every goal stays on offer for every kind.
 *
 * The words for the people it deals with ("customers", "clients",
 * "readers") are the kind's too.
 */
function goalsFor(kind: unknown): Goal[] {
    const { people } = kindWords(kind);
    const goals: Goal[] = [
        {
            moduleKey: "COMMERCE",
            title: "Sell products",
            description: "Run a catalog, take orders, and manage inventory.",
        },
        {
            moduleKey: "APPOINTMENTS",
            title: "Take appointments",
            description: `Offer services and let ${people} book time with you.`,
        },
        {
            moduleKey: "COURSES",
            title: "Run courses",
            description:
                "Sell a set of dated sessions with limited seats, like a six-week class.",
        },
        {
            moduleKey: "WEBSITE",
            title: "Show up online",
            description:
                "Publish a website with pages, forms, and your own domain.",
        },
        {
            moduleKey: "CRM",
            title: `Manage ${people} & leads`,
            description: "Capture enquiries and track them through a pipeline.",
        },
        {
            moduleKey: "PAYMENTS",
            title: "Take payments",
            description:
                "Connect a provider to get paid for bookings and orders.",
        },
        {
            moduleKey: "COMMUNICATIONS",
            title: `Message ${people}`,
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
    const suggested = preselect(kind);
    return [
        ...goals.filter((g) => g.moduleKey === suggested),
        ...goals.filter((g) => g.moduleKey !== suggested),
    ];
}

export function ModuleGoalPicker({
    modules,
    kind,
}: {
    modules: ModuleView[];
    /** What is being set up (DEC-070); absent, a business. */
    kind?: string;
}) {
    const router = useRouter();
    const goals = useMemo(() => goalsFor(kind), [kind]);
    const suggested = preselect(kind);
    // The picks, handed to the "Turn on" sheet (DEC-068); null when closed.
    const [turningOn, setTurningOn] = useState<string[] | null>(null);
    const pending = turningOn !== null;

    const byKey = useMemo(
        () => new Map(modules.map((m) => [m.key, m])),
        [modules],
    );

    /** Already on before this screen — shown as fact, never as a choice. */
    const alreadyOn = useMemo(
        () =>
            new Set(
                modules
                    .filter((m) => m.lifecycle === "ENABLED")
                    .map((m) => m.key),
            ),
        [modules],
    );

    /**
     * Only what Saroh has rolled out to this business (DEC-057): the API
     * lists every module, a dark one with ROLLOUT_DISABLED. The dependency
     * walk below still reads every module, so a hidden one already on
     * counts as on and is never named.
     */
    const shown = useMemo(() => rolledOutKeys(modules), [modules]);
    const available = useMemo(
        () => goals.filter((g) => shown.has(g.moduleKey)),
        [goals, shown],
    );
    /**
     * Only offer what this member is actually allowed to turn on. Rendering a
     * control whose action the server will reject is a fake affordance; the
     * org creator (who reaches this screen) has `canManage` everywhere, so in
     * the normal path nothing is filtered.
     */
    const choosable = available.filter(
        (g) => !alreadyOn.has(g.moduleKey) && byKey.get(g.moduleKey)?.canManage,
    );

    const [selected, setSelected] = useState<Set<string>>(() => {
        // Pre-select the kind's suggestion so the screen answers its own
        // question. Nothing is committed, so this is a suggestion the merchant
        // can undo in one click — not a default they are stuck with.
        const initial = new Set<string>();
        if (
            suggested &&
            shown.has(suggested) &&
            !alreadyOn.has(suggested) &&
            byKey.get(suggested)?.canManage
        ) {
            initial.add(suggested);
        }
        return initial;
    });

    /** Transitive, server-owned dependency closure for a module. */
    const withDeps = useMemo(() => {
        return (moduleKey: string): string[] => {
            const order: string[] = [];
            const visit = (key: string) => {
                for (const dep of byKey.get(key)?.dependencies ?? [])
                    visit(dep);
                if (!order.includes(key)) order.push(key);
            };
            visit(moduleKey);
            return order;
        };
    }, [byKey]);

    /**
     * Prerequisites a goal drags in that the merchant has not chosen. Named with
     * the goal wording where we have it — a merchant reading this screen has
     * just been offered "Manage customers & leads"; telling them it also turns
     * on "CRM" makes them match a registry label to a row themselves.
     */
    const hiddenDepsFor = (moduleKey: string): string[] =>
        withDeps(moduleKey)
            .filter((k) => k !== moduleKey && !alreadyOn.has(k))
            .map(
                (k) =>
                    goals.find((g) => g.moduleKey === k)?.title ??
                    byKey.get(k)?.label ??
                    k,
            );

    const toggle = (moduleKey: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(moduleKey)) next.delete(moduleKey);
            else next.add(moduleKey);
            return next;
        });
    };

    /** Everything the confirm will actually turn on, prerequisites included. */
    const resolved = useMemo(() => {
        const all = new Set<string>();
        for (const key of Array.from(selected)) {
            for (const dep of withDeps(key)) {
                if (!alreadyOn.has(dep)) all.add(dep);
            }
        }
        return all;
    }, [selected, withDeps, alreadyOn]);

    const confirm = () => {
        if (selected.size === 0) {
            router.push("/");
            return;
        }
        // One sheet for every pick: one form with a section for each
        // module that asks for something, and one "Turn on". It lands on
        // the first pick's screen when it is done.
        setTurningOn(
            goals.map((g) => g.moduleKey).filter((k) => selected.has(k)),
        );
    };

    return (
        <div className="space-y-8">
            <TurnOnSheet
                picked={turningOn}
                modules={modules}
                onOpenChange={(open) => {
                    if (!open) setTurningOn(null);
                }}
            />
            {choosable.length > 0 ? (
                <fieldset className="space-y-3" disabled={pending}>
                    <legend className="sr-only">
                        Choose what to set up first
                    </legend>

                    {choosable.map((goal, index) => {
                        const isSelected = selected.has(goal.moduleKey);
                        const deps = hiddenDepsFor(goal.moduleKey);
                        const labelId = `goal-${goal.moduleKey}-label`;
                        const descriptionId = `goal-${goal.moduleKey}-description`;

                        return (
                            // Wrapping <label> makes the whole row a real hit
                            // target without inventing a control. No `htmlFor`:
                            // the checkbox names itself from the title alone via
                            // aria-labelledby, so the reader hears "Sell products,
                            // checkbox" rather than the row's entire prose.
                            <label
                                key={goal.moduleKey}
                                // `wk-choice` + `data-selected` carry the commit
                                // motion (workspace.css): the row settles with a
                                // small overshoot when chosen, so the most
                                // consequential click in the funnel is felt and
                                // not just recoloured. `wk-item` staggers the
                                // initial arrival.
                                data-selected={isSelected}
                                style={
                                    { "--wk-i": index } as React.CSSProperties
                                }
                                className={`wk-choice wk-item flex cursor-pointer items-start gap-4 rounded-lg border p-4 hover:border-brand/40 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 ${
                                    isSelected
                                        ? "border-brand bg-brand-subtle/40"
                                        : "border-border"
                                }`}
                            >
                                <Checkbox
                                    checked={isSelected}
                                    onCheckedChange={() =>
                                        toggle(goal.moduleKey)
                                    }
                                    aria-labelledby={labelId}
                                    aria-describedby={descriptionId}
                                    className="mt-0.5"
                                />
                                <span className="min-w-0 flex-1">
                                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                        <span
                                            id={labelId}
                                            className="text-sm font-semibold text-foreground"
                                        >
                                            {goal.title}
                                        </span>
                                        {goal.moduleKey === suggested ? (
                                            <span className="rounded-full bg-highlight-subtle px-2 py-0.5 text-[11px] font-medium text-highlight-subtle-foreground">
                                                Suggested
                                            </span>
                                        ) : null}
                                    </span>
                                    <span
                                        id={descriptionId}
                                        className="mt-1 block text-sm text-muted-foreground"
                                    >
                                        {goal.description}
                                        {deps.length > 0 ? (
                                            <span className="mt-1 block">
                                                Also turns on{" "}
                                                {deps.join(" and ")}, which it
                                                needs.
                                            </span>
                                        ) : null}
                                    </span>
                                </span>
                            </label>
                        );
                    })}
                </fieldset>
            ) : null}

            {available.some((g) => alreadyOn.has(g.moduleKey)) ? (
                <div className="space-y-2">
                    <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Already on
                    </h2>
                    <ul className="flex flex-wrap gap-2">
                        {available
                            .filter((g) => alreadyOn.has(g.moduleKey))
                            .map((goal) => (
                                <li
                                    key={goal.moduleKey}
                                    className="inline-flex items-center gap-1.5 text-sm text-muted-foreground"
                                >
                                    <Check
                                        className="size-4 shrink-0 text-success"
                                        aria-hidden
                                    />
                                    {goal.title}
                                </li>
                            ))}
                    </ul>
                    <p className="text-sm text-muted-foreground">
                        Turn these off any time in{" "}
                        <Link
                            href="/settings/modules"
                            className="text-brand underline-offset-4 hover:underline"
                        >
                            Settings → Modules
                        </Link>
                        .
                    </p>
                </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-4 border-t pt-6">
                <p
                    className="text-sm text-muted-foreground"
                    // Announce the running total so the consequence of the
                    // choice is available without re-reading every row.
                    aria-live="polite"
                >
                    {resolved.size === 0
                        ? "Nothing selected — you can add capabilities later."
                        : `${resolved.size} ${resolved.size === 1 ? "capability" : "capabilities"} will be turned on.`}
                </p>
                <div className="flex items-center gap-2">
                    <Button
                        variant="ghost"
                        className="wk-press"
                        onClick={() => router.push("/")}
                        disabled={pending}
                    >
                        Skip for now
                    </Button>
                    <Button
                        variant="brand"
                        className="wk-press"
                        onClick={confirm}
                        disabled={pending}
                    >
                        {resolved.size === 0
                            ? "Continue"
                            : "Set up my workspace"}
                    </Button>
                </div>
            </div>
        </div>
    );
}
