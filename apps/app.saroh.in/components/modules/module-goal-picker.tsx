"use client";

import { Button } from "@saroh/ui/button";
import { Checkbox } from "@saroh/ui/checkbox";
import { Check } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { setModuleStatusAction } from "@/lib/modules/actions";
import type { ModuleView } from "@/lib/modules/schema";

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
 * Commerce leads (product decision 2026-08-02: commerce-led, not commerce-only),
 * so selling is offered first and pre-selected. Everything else is a peer, not a
 * lesser option — the ordering states a default, it does not rank the business
 * models we serve.
 */
const RECOMMENDED_KEY = "COMMERCE";

const GOALS: Goal[] = [
    {
        moduleKey: "COMMERCE",
        title: "Sell products",
        description: "Run a catalog, take orders, and manage inventory.",
    },
    {
        moduleKey: "APPOINTMENTS",
        title: "Take appointments",
        description: "Offer services and let customers book time with you.",
    },
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

    const available = useMemo(
        () => GOALS.filter((g) => byKey.has(g.moduleKey)),
        [byKey],
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
        // Pre-select the recommended goal so the screen answers its own
        // question. Nothing is committed, so this is a suggestion the merchant
        // can undo in one click — not a default they are stuck with.
        const initial = new Set<string>();
        if (byKey.has(RECOMMENDED_KEY) && !alreadyOn.has(RECOMMENDED_KEY)) {
            initial.add(RECOMMENDED_KEY);
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
                    GOALS.find((g) => g.moduleKey === k)?.title ??
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
        startTransition(async () => {
            // Commit prerequisites before dependants, in the server's order.
            const ordered: string[] = [];
            for (const key of Array.from(selected)) {
                for (const dep of withDeps(key)) {
                    if (!alreadyOn.has(dep) && !ordered.includes(dep)) {
                        ordered.push(dep);
                    }
                }
            }
            for (const key of ordered) {
                const result = await setModuleStatusAction(key, "ENABLED");
                if (!result.ok) {
                    // Stop at the first failure rather than pressing on — a
                    // partially-enabled set is worse than a clear error, and the
                    // merchant's remaining selection is still on screen to retry.
                    toast.error(result.error);
                    return;
                }
            }
            router.push("/");
        });
    };

    return (
        <div className="space-y-8">
            {choosable.length > 0 ? (
                <fieldset className="space-y-3" disabled={pending}>
                    <legend className="sr-only">
                        Choose what to set up first
                    </legend>

                    {choosable.map((goal) => {
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
                                className={`flex cursor-pointer items-start gap-4 rounded-lg border p-4 transition-colors hover:border-brand/40 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 ${
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
                                        {goal.moduleKey === RECOMMENDED_KEY ? (
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

            {alreadyOn.size > 0 ? (
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
                        onClick={() => router.push("/")}
                        disabled={pending}
                    >
                        Skip for now
                    </Button>
                    <Button
                        variant="brand"
                        onClick={confirm}
                        disabled={pending}
                    >
                        {pending
                            ? "Setting up…"
                            : resolved.size === 0
                              ? "Continue"
                              : "Set up my workspace"}
                    </Button>
                </div>
            </div>
        </div>
    );
}
