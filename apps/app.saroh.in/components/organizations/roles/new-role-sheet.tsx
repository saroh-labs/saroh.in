"use client";

import { showPlanRefusal } from "@/components/billing/plan-refusal";
import { RadioCards } from "@/components/shared/fields/choice-group";
import { FormSheet } from "@/components/shared/forms/form-sheet";
import { Refusal } from "@/components/shared/states/refusal";
import { runAction } from "@/lib/api/run-action";
import { createRole } from "@/lib/organizations/role-actions";
import type { Role, RoleCatalogue } from "@/lib/organizations/roles";
import { showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { RoleNameField } from "./role-name-field";
import { ROLE_LABEL, ROLE_PLAIN } from "./role-words";

/** The built-ins a new role may start from. Owner is not offered: see below. */
export const START_FROM = [
    { key: "", label: "Nothing. I will tick what it needs" },
    { key: "MEMBER", label: `${ROLE_LABEL.MEMBER}: ${ROLE_PLAIN.MEMBER}` },
    { key: "ADMIN", label: `${ROLE_LABEL.ADMIN}: ${ROLE_PLAIN.ADMIN}` },
    { key: "REVIEWER", label: "Reviewer: look at websites and sign them off" },
] as const;

/**
 * Name a role, and say where its ticks start.
 *
 * Starting from a built-in is a convenience, not an inheritance: the new role
 * gets a COPY of those permissions and is edited independently afterwards.
 * Owner is not offered, because the one thing Owner has that nothing else may
 * — closing the business — is exactly what an invented role cannot be given.
 */
export function NewRoleSheet({
    open,
    onOpenChange,
    roles,
    catalogue,
    holds,
    onCreated,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    roles: Role[];
    catalogue: RoleCatalogue | null;
    holds: (action: string) => boolean;
    onCreated: (key: string) => void;
}) {
    const router = useRouter();
    const [pending, setPending] = useState(false);
    const [label, setLabel] = useState("");
    const [from, setFrom] = useState<string>("");
    const [tried, setTried] = useState(false);
    // Said in the sheet, always (UX-030): a refusal behind an open overlay
    // read as nothing happening.
    const [error, setError] = useState<string | null>(null);
    const nameless = tried && label.trim().length === 0;

    const reset = () => {
        setLabel("");
        setFrom("");
        setTried(false);
        setError(null);
    };
    const close = () => {
        onOpenChange(false);
        reset();
    };

    // What the copy takes from the role it starts from: what may be granted
    // at all, and of that only what the viewer holds themselves (F19).
    const grantable = new Set(
        (catalogue?.capabilities ?? []).map((c) => c.action),
    );
    const copyable = (roles.find((r) => r.key === from)?.actions ?? []).filter(
        (a) => grantable.has(a),
    );
    const actions = copyable.filter(holds);
    const leftOff = copyable.length - actions.length;

    async function create() {
        setTried(true);
        if (label.trim().length === 0) return;
        setError(null);
        const res = await runAction(
            () => createRole({ label: label.trim(), actions }),
            // Said in the sheet, beside what was typed.
            { setBusy: setPending, quiet: true, onUnreached: setError },
        );
        if (!res) return;
        if (!res.ok) {
            // Custom roles aren't in the plan (U13): the way up, from
            // its own notice once this sheet is out of the way.
            if (res.plan) {
                close();
                showPlanRefusal(res.plan);
                return;
            }
            setError(
                res.error.trim()
                    ? res.error
                    : "The role couldn't be created. Try again.",
            );
            return;
        }
        showSuccess("Role created.");
        onCreated(res.data.key);
        close();
        router.refresh();
    }

    return (
        <FormSheet
            open={open}
            title="New role"
            description="Name it for the job, then tick what it may do. Nobody holds it until you give it to someone."
            pending={pending}
            saveLabel="Create role"
            savingLabel="Creating…"
            fieldsClassName="gap-4"
            onClose={close}
            onSubmit={create}
        >
            <RoleNameField
                id="new-role-name"
                value={label}
                onChange={setLabel}
                nameless={nameless}
                disabled={pending}
                placeholder="Stock clerk"
            />
            <fieldset className="grid gap-2">
                <legend className="mb-1.5 text-sm font-medium">
                    Start from
                </legend>
                <RadioCards
                    label="Start from"
                    value={from}
                    onChange={setFrom}
                    disabled={pending}
                    options={START_FROM.map((option) => ({
                        value: option.key,
                        label: option.label,
                    }))}
                    rowClassName="font-normal"
                />
                <p className="text-[11.5px] leading-[1.45] text-muted-foreground">
                    A copy, not a link. Changing this role later does not change
                    the one it started from.
                </p>
                {leftOff > 0 ? (
                    <p className="text-[11.5px] leading-[1.45] text-muted-foreground">
                        {leftOff === 1
                            ? "1 of its permissions is one you don't have, so it is left off."
                            : `${leftOff} of its permissions are ones you don't have, so they are left off.`}
                    </p>
                ) : null}
            </fieldset>
            <Refusal>{error}</Refusal>
        </FormSheet>
    );
}
