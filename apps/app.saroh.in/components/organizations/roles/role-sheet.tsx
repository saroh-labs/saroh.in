"use client";

import { FormSheet } from "@/components/shared/form-sheet";
import { Refusal } from "@/components/shared/refusal";
import { runAction } from "@/lib/api/run-action";
import { updateRole } from "@/lib/organizations/role-actions";
import type { Role, RoleCatalogue } from "@/lib/organizations/roles";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Permissions } from "./permissions";

/**
 * Edit a role of the business's own: its name and its ticks, in the one
 * side sheet (`FormSheet`). Each opening is a fresh draft (a `key`), and
 * nothing is saved until Save. A refusal stays in the sheet.
 */
export function RoleSheet({
    open,
    role,
    catalogue,
    holds,
    onClose,
}: {
    open: boolean;
    role: Role;
    catalogue: RoleCatalogue;
    holds: (action: string) => boolean;
    onClose: () => void;
}) {
    const router = useRouter();
    const [pending, setPending] = useState(false);
    const [label, setLabel] = useState(role.label);
    const [tried, setTried] = useState(false);
    const [refusal, setRefusal] = useState<string | null>(null);
    const [granted, setGranted] = useState<ReadonlySet<string>>(
        () => new Set(role.actions),
    );
    const saved = useMemo(() => new Set(role.actions), [role.actions]);
    const labelChanged = label.trim() !== role.label;
    const actionsChanged =
        granted.size !== saved.size ||
        Array.from(granted).some((a) => !saved.has(a));
    const nameless = tried && label.trim().length === 0;

    const toggle = (action: string, on: boolean) =>
        setGranted((prev) => {
            const next = new Set(prev);
            if (on) next.add(action);
            else next.delete(action);
            return next;
        });

    async function save() {
        setTried(true);
        if (label.trim().length === 0) return;
        setRefusal(null);
        const res = await runAction(
            () =>
                updateRole(role.key, {
                    ...(labelChanged ? { label: label.trim() } : {}),
                    ...(actionsChanged ? { actions: Array.from(granted) } : {}),
                }),
            // Said in the sheet, beside what was typed.
            { setBusy: setPending, quiet: true, onUnreached: setRefusal },
        );
        if (!res) return;
        if (!res.ok) {
            setRefusal(
                res.error.trim()
                    ? res.error
                    : "The role couldn't be saved. Try again.",
            );
            return;
        }
        showSuccess("Role saved.");
        onClose();
        router.refresh();
    }

    return (
        <FormSheet
            wide
            open={open}
            title={`Edit ${role.label}`}
            description="Its name, and what whoever holds it may do. It applies as soon as you save."
            pending={pending}
            dirty={labelChanged || actionsChanged}
            fieldsClassName="gap-3"
            onClose={onClose}
            onSubmit={save}
        >
            <div className="grid gap-1.5">
                <Label htmlFor={`role-name-${role.key}`}>Name</Label>
                <Input
                    id={`role-name-${role.key}`}
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    maxLength={40}
                    disabled={pending}
                    aria-invalid={nameless || undefined}
                    aria-describedby={
                        nameless ? `role-name-${role.key}-problem` : undefined
                    }
                />
                {nameless ? (
                    <p
                        id={`role-name-${role.key}-problem`}
                        role="alert"
                        className="text-[12.5px] font-medium text-destructive-subtle-foreground"
                    >
                        A role needs a name.
                    </p>
                ) : null}
            </div>
            <div>
                <Permissions
                    idPrefix={`edit-perm-${role.key}`}
                    catalogue={catalogue}
                    granted={granted}
                    holds={holds}
                    pending={pending}
                    onToggle={toggle}
                />
            </div>
            <Refusal>{refusal}</Refusal>
        </FormSheet>
    );
}
