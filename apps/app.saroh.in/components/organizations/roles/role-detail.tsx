"use client";

import type { ConfirmResult } from "@/components/shared/confirm-dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FailedRead } from "@/components/shared/failed-read";
import { StatusBadge } from "@/components/shared/status-badge";
import { count, plural } from "@/lib/format/plural";
import { deleteRole } from "@/lib/organizations/role-actions";
import type { Role, RoleCatalogue } from "@/lib/organizations/roles";
import { RoleDot } from "@saroh/ui/avatar";
import { Button } from "@saroh/ui/button";
import { showSuccess } from "@saroh/ui/toast";
import { Info } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Permissions } from "./permissions";
import { aboveRoleNote } from "./role-reach";
import { RoleSheet } from "./role-sheet";

/**
 * One role, and what it may do: read here, changed in a side sheet.
 *
 * The panel shows the role as it is saved. "Edit role" opens `RoleSheet`
 * with its name and its ticks, and nothing changes until its Save, so
 * switching roles never carries a half-made change along.
 */
export function RoleDetail({
    role,
    catalogue,
    canEdit: mayEditRoles,
    holds,
    blurb,
    onRemoved,
}: {
    role: Role;
    catalogue: RoleCatalogue | null;
    canEdit: boolean;
    holds: (action: string) => boolean;
    blurb: string;
    onRemoved: () => void;
}) {
    // A role that can already do more than the viewer is not theirs to
    // change, rename or remove — only to look at (F19).
    const aboveViewer = role.system
        ? []
        : role.actions.filter((a) => !holds(a));
    const canEdit = mayEditRoles && aboveViewer.length === 0;
    const aboveLabels = aboveViewer.flatMap((a) => {
        const c = catalogue?.capabilities.find((x) => x.action === a);
        return c ? [c.label] : [];
    });
    const router = useRouter();
    // Which opening of the sheet this is: each one is a fresh draft.
    const [editing, setEditing] = useState(0);
    const [sheetOpen, setSheetOpen] = useState(false);
    const [confirmRemove, setConfirmRemove] = useState(false);
    const saved = useMemo(() => new Set(role.actions), [role.actions]);

    async function remove(): Promise<ConfirmResult> {
        const res = await deleteRole(role.key);
        if (!res.ok) return { ok: false, error: res.error };
        showSuccess("Role removed.");
        onRemoved();
        router.refresh();
    }

    const held = role.members;

    return (
        <div className="min-w-0 flex-[1_1_420px] overflow-clip rounded-xl border border-border">
            <div className="border-b border-muted px-4 py-3.5">
                <div className="flex flex-wrap items-center gap-[11px]">
                    <RoleDot role={role.key} size={13} />
                    <h2 className="font-display text-[18px] font-semibold tracking-[-0.025em]">
                        {role.label}
                    </h2>
                    {role.system ? null : (
                        <StatusBadge tone="neutral" className="ml-auto">
                            {held === 0
                                ? "Nobody holds it yet"
                                : `${count(held, "person", "people")} ${plural(held, "holds", "hold")} it`}
                        </StatusBadge>
                    )}
                </div>
                <p className="mt-[9px] text-[12.5px] leading-[1.55] text-neutral-600 dark:text-muted-foreground">
                    {blurb}
                </p>
            </div>

            {catalogue === null ? (
                <FailedRead
                    things="the list of permissions"
                    reassurance="Nothing about this role has changed."
                    className="px-4 py-6"
                />
            ) : (
                <div className="px-4 pb-3.5 pt-1.5">
                    <Permissions
                        idPrefix={`perm-${role.key}`}
                        catalogue={catalogue}
                        granted={saved}
                    />
                </div>
            )}

            <div className="flex flex-wrap items-center gap-3 border-t border-muted bg-foreground/[0.03] px-4 py-[13px]">
                {role.system || !canEdit ? (
                    <>
                        <Info
                            aria-hidden
                            className="size-4 shrink-0 text-muted-foreground"
                        />
                        <p className="min-w-0 flex-1 text-[12.5px] leading-[1.5] text-neutral-600 dark:text-muted-foreground">
                            {role.system
                                ? "Built-in roles mean the same thing in every business, so they cannot be changed. Make a role of your own to grant a different set."
                                : mayEditRoles && aboveViewer.length > 0
                                  ? aboveRoleNote(aboveLabels)
                                  : "Only someone who can change roles may edit this one."}
                        </p>
                    </>
                ) : (
                    <>
                        <Button
                            type="button"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            disabled={held > 0}
                            onClick={() => setConfirmRemove(true)}
                        >
                            Remove role
                        </Button>
                        {held > 0 ? (
                            <span className="text-[11.5px] text-muted-foreground">
                                {held === 1
                                    ? "Move the person who holds it first."
                                    : `Move the ${held} people who hold it first.`}
                            </span>
                        ) : null}
                        <Button
                            type="button"
                            variant="outline"
                            className="ml-auto"
                            disabled={catalogue === null}
                            onClick={() => {
                                setEditing((n) => n + 1);
                                setSheetOpen(true);
                            }}
                        >
                            Edit role
                        </Button>
                    </>
                )}
            </div>

            {canEdit && catalogue && editing > 0 ? (
                <RoleSheet
                    key={editing}
                    open={sheetOpen}
                    role={role}
                    catalogue={catalogue}
                    holds={holds}
                    onClose={() => setSheetOpen(false)}
                />
            ) : null}
            <ConfirmDialog
                open={confirmRemove}
                onOpenChange={setConfirmRemove}
                title={`Remove ${role.label}?`}
                description="Nobody holds it, so nobody loses anything. It can be made again later, but its ticks will not come back. This cannot be undone."
                confirmLabel="Remove role"
                keepLabel="Keep role"
                onConfirm={remove}
            />
        </div>
    );
}
