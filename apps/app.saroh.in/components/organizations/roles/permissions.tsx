"use client";

import { CAPABILITY_GROUP_LABEL as GROUP_LABEL } from "@/lib/organizations/capability-groups";
import type { Capability, RoleCatalogue } from "@/lib/organizations/roles";
import { Label } from "@saroh/ui/label";
import { Switch } from "@saroh/ui/switch";
import { useMemo } from "react";
import { NOT_YOURS_TO_GIVE } from "./role-reach";

/**
 * A role's permissions by group, each with its switch. Read-only without
 * `onToggle` (the panel); in the sheet a permission the viewer lacks is
 * locked with the reason beside it.
 */
export function Permissions({
    idPrefix,
    catalogue,
    granted,
    holds,
    pending = false,
    onToggle,
}: {
    idPrefix: string;
    catalogue: RoleCatalogue;
    granted: ReadonlySet<string>;
    holds?: (action: string) => boolean;
    pending?: boolean;
    onToggle?: (action: string, on: boolean) => void;
}) {
    const byGroup = useMemo(() => {
        const groups = new Map<string, Capability[]>();
        for (const c of catalogue.capabilities) {
            const list = groups.get(c.group) ?? [];
            list.push(c);
            groups.set(c.group, list);
        }
        return catalogue.groups.flatMap((g) => {
            const capabilities = groups.get(g);
            return capabilities ? [{ group: g, capabilities }] : [];
        });
    }, [catalogue]);

    return (
        <>
            {byGroup.map(({ group, capabilities }) => {
                const on = capabilities.filter((c) =>
                    granted.has(c.action),
                ).length;
                return (
                    <section key={group} className="pt-3">
                        <div className="flex items-baseline justify-between pb-1.5">
                            <h3 className="label">
                                {GROUP_LABEL[group] ?? group}
                            </h3>
                            <span className="text-[11px] tabular-nums text-muted-foreground">
                                {on} of {capabilities.length}
                            </span>
                        </div>
                        {capabilities.map((c) => {
                            const checked = granted.has(c.action);
                            const id = `${idPrefix}-${c.action}`;
                            const notYours =
                                Boolean(onToggle) &&
                                holds?.(c.action) === false;
                            return (
                                <div
                                    key={c.action}
                                    className="flex items-center gap-3 border-t border-border py-[9px]"
                                >
                                    <Label
                                        data-ph-unmask=""
                                        htmlFor={id}
                                        className="min-w-0 flex-1 text-[13px] font-normal leading-normal"
                                    >
                                        <span className="block text-[13px]">
                                            {c.label}
                                        </span>
                                        {c.note ? (
                                            <span className="mt-0.5 block text-[11px] leading-[1.45] text-muted-foreground">
                                                {c.note}
                                            </span>
                                        ) : null}
                                        {notYours ? (
                                            <span className="mt-0.5 block text-[11px] leading-[1.45] text-muted-foreground">
                                                {NOT_YOURS_TO_GIVE}
                                            </span>
                                        ) : null}
                                    </Label>
                                    <Switch
                                        id={id}
                                        checked={checked}
                                        disabled={
                                            !onToggle || notYours || pending
                                        }
                                        onCheckedChange={(v) =>
                                            onToggle?.(c.action, v)
                                        }
                                        aria-label={`${c.label}, ${checked ? "allowed" : "not allowed"}`}
                                    />
                                </div>
                            );
                        })}
                    </section>
                );
            })}
        </>
    );
}
