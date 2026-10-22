"use client";

import { count } from "@/lib/format/plural";
import type { Role } from "@/lib/organizations/roles";
import { RoleDot } from "@saroh/ui/avatar";
import { cn } from "@saroh/ui/lib/utils";

export function ListSection({
    label,
    children,
}: {
    label: string;
    children: React.ReactNode;
}) {
    return (
        <div className="border-b border-border last:border-b-0">
            <p className="label px-[15px] py-[11px]">{label}</p>
            {children}
        </div>
    );
}

/**
 * A role in the list: its name, and under it who holds it and what it opens
 * — a built-in's in words ("can open everything"), a made role's as its count
 * of permissions, since its ticks are the business's own.
 */
export function RoleRow({
    role,
    plain,
    on,
    onPick,
}: {
    role: Role;
    plain?: string;
    on: boolean;
    onPick: () => void;
}) {
    const people = count(role.members, "person", "people");
    return (
        <button
            type="button"
            aria-pressed={on}
            onClick={onPick}
            className={cn(
                "flex w-full items-center gap-[11px] border-t border-border px-[15px] py-2.5 text-left transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                on
                    ? "bg-muted shadow-[inset_2px_0_0_hsl(var(--foreground))]"
                    : "hover:bg-foreground/[0.035]",
            )}
        >
            <RoleDot role={role.key} />
            <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-medium">
                    {role.label}
                </span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">
                    {people} ·{" "}
                    {plain ??
                        (role.actions.length === 1
                            ? "1 permission"
                            : `${role.actions.length} permissions`)}
                </span>
            </span>
        </button>
    );
}
