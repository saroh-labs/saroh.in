"use client";

import { cn } from "@saroh/ui/lib/utils";
import { useState } from "react";

import type { ExtraGroup } from "@/lib/organizations/extras";
import {
    extraGroups,
    extraLabels,
    extrasBeyond,
    extrasLockedReason,
    extrasSummary,
    sameExtras,
} from "@/lib/organizations/extras";
import type { RoleCatalogue } from "@/lib/organizations/roles";

/**
 * The Edit drawer's extras draft: what the person holds now, what is being
 * chosen, and what the list offers for the role picked in the drawer (the
 * draft role, as the design reads it — pick Admin and most switches lock).
 */
export function useMemberExtras({
    extras,
    currentGrants,
    draftGrants,
    draftRoleLabel,
    reviewer,
    isSelf,
    canEdit,
    beyond,
    name,
    catalogue,
    myActions,
}: {
    /** The person's extras now, as the API sent them. */
    extras: readonly string[] | undefined;
    currentGrants: ReadonlySet<string>;
    draftGrants: ReadonlySet<string>;
    draftRoleLabel: string;
    reviewer: boolean;
    isSelf: boolean;
    canEdit: boolean;
    /** The person can do more than the viewer, role or extras. */
    beyond: boolean;
    name: string;
    catalogue: RoleCatalogue | null;
    myActions: string[] | null;
}) {
    const [draft, setDraft] = useState<string[] | null>(null);
    const current = extrasBeyond(extras, currentGrants);
    // What would be held beyond the picked role; one the role now grants
    // is simply part of it.
    const chosen = extrasBeyond(draft ?? current, draftGrants);
    const lockedReason = extrasLockedReason({
        isSelf,
        canEdit,
        reviewer,
        beyondViewer: beyond,
        name,
    });
    const groups =
        catalogue && lockedReason === null
            ? extraGroups({
                  catalogue,
                  grants: draftGrants,
                  draft: chosen,
                  myActions,
              })
            : [];
    return {
        groups,
        lockedReason:
            lockedReason ??
            (catalogue
                ? null
                : "The list of permissions couldn't be loaded. Reload to try again."),
        chosen,
        /** Only when the switches could have moved them. */
        changed:
            lockedReason === null && !reviewer && !sameExtras(chosen, current),
        summary: extrasSummary(draftRoleLabel, extraLabels(chosen, catalogue)),
        toggle: (action: string, on: boolean) =>
            setDraft(
                on
                    ? Array.from(new Set([...chosen, action]))
                    : chosen.filter((a) => a !== action),
            ),
        reset: () => setDraft(null),
    };
}

/**
 * A person's extra permissions on Team (F17, DEC-039), after the "Saroh
 * Settings" design: the People column's chips, and the Edit drawer's
 * "Extra permissions" list. Apart from `team-screen.tsx`, which is on the
 * size ledger (`00-universal.md` §6); the rules are `lib/organizations/extras.ts`.
 */

/** The People column: a chip per extra, or "—" for none. */
export function ExtrasCell({ labels }: { labels: string[] }) {
    if (labels.length === 0) {
        return (
            <span className="text-[13px] text-muted-foreground">
                <span aria-hidden>—</span>
                <span className="sr-only">No extra permissions</span>
            </span>
        );
    }
    return (
        <ul
            aria-label="Extra permissions"
            className="flex min-w-0 flex-wrap gap-[5px]"
        >
            {labels.map((label) => (
                <li
                    key={label}
                    className="whitespace-nowrap rounded-full bg-brand-subtle px-[9px] py-[3px] text-[11px] font-medium text-brand-subtle-foreground"
                >
                    {label}
                </li>
            ))}
        </ul>
    );
}

/** The same, as a line under the name where there is no column for it. */
export function ExtrasLine({ labels }: { labels: string[] }) {
    if (labels.length === 0) return null;
    return (
        <p className="mt-px truncate text-[11.5px] text-muted-foreground xl:hidden">
            Also: {labels.join(", ")}
        </p>
    );
}

/**
 * The drawer's "Extra permissions": every power the viewer could give,
 * grouped as the role editor groups them, each a switch. What the role
 * already grants is shown on and locked, because an extra can only add.
 * When no switch may move — the viewer's own row, someone above them, a
 * Reviewer, or a viewer who can't change roles — it says why instead.
 */
export function ExtraPermissions({
    roleLabel,
    groups,
    lockedReason,
    disabled,
    onToggle,
}: {
    roleLabel: string;
    groups: ExtraGroup[];
    /** Why nothing here can change, in words; null when it can. */
    lockedReason: string | null;
    disabled: boolean;
    onToggle: (action: string, on: boolean) => void;
}) {
    return (
        <section aria-labelledby="extra-permissions-title" className="mt-5">
            <h3
                id="extra-permissions-title"
                className="mb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground"
            >
                Extra permissions
            </h3>
            <p className="mb-[11px] text-pretty text-[12.5px] leading-[1.5] text-neutral-600 dark:text-muted-foreground">
                {lockedReason ??
                    `On top of what ${roleLabel} already allows. Anything the role grants is shown locked, because an extra can only add.`}
            </p>
            {lockedReason === null && groups.length > 0 ? (
                <div className="flex flex-col gap-[5px] rounded-[10px] border border-muted p-1.5">
                    {groups.map(({ group, label, choices }) => (
                        <div
                            key={group}
                            role="group"
                            aria-label={label}
                            className="flex flex-col gap-[5px]"
                        >
                            <p className="px-[11px] pb-0.5 pt-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground first:pt-1">
                                {label}
                            </p>
                            {choices.map(({ capability, state }) => (
                                <ExtraSwitch
                                    key={capability.action}
                                    label={capability.label}
                                    sub={
                                        state === "role"
                                            ? `comes with ${roleLabel}`
                                            : capability.note
                                    }
                                    on={state !== "off"}
                                    locked={state === "role"}
                                    disabled={disabled}
                                    onToggle={(on) =>
                                        onToggle(capability.action, on)
                                    }
                                />
                            ))}
                        </div>
                    ))}
                </div>
            ) : null}
        </section>
    );
}

/**
 * One row, the whole of it the switch (the design's `role="switch"` row):
 * pointer, hover, focus and pressed states when it can move; locked rows sit
 * on the muted ground and don't respond.
 */
function ExtraSwitch({
    label,
    sub,
    on,
    locked,
    disabled,
    onToggle,
}: {
    label: string;
    sub?: string;
    on: boolean;
    locked: boolean;
    disabled: boolean;
    onToggle: (on: boolean) => void;
}) {
    const inert = locked || disabled;
    return (
        <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-disabled={inert || undefined}
            aria-label={`${label}, ${on ? "on" : "off"}${locked ? ", included in the role" : ""}`}
            onClick={() => {
                if (!inert) onToggle(!on);
            }}
            className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-[11px] py-[9px] text-left transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:min-h-11",
                locked
                    ? "cursor-default bg-foreground/[0.03]"
                    : disabled
                      ? "cursor-not-allowed bg-card opacity-60"
                      : "cursor-pointer bg-card hover:bg-foreground/[0.035] active:bg-foreground/[0.06]",
            )}
        >
            <span className="min-w-0 flex-1">
                <span
                    className={cn(
                        "block text-[12.5px]",
                        locked ? "text-muted-foreground" : "text-foreground",
                    )}
                >
                    {label}
                </span>
                {sub ? (
                    <span className="mt-0.5 block text-[11px] leading-[1.45] text-muted-foreground">
                        {sub}
                    </span>
                ) : null}
            </span>
            <span
                aria-hidden
                className={cn(
                    "relative inline-block h-6 w-[42px] shrink-0 rounded-full transition-colors duration-fast",
                    on
                        ? locked
                            ? "bg-muted-foreground/40"
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
