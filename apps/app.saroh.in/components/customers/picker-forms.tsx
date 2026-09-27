"use client";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { useId, useState } from "react";

import type {
    CustomerSearchResult,
    NewCustomerDraft,
} from "@/lib/customers/picker";
import { EMAIL, resultLabel } from "@/lib/customers/picker";

/**
 * The customer picker's small inline forms (E4): someone new, a walk-in
 * (B13), and "is this the same person?". Each sits under the chips, inside
 * whatever dialog holds the picker, so none is a form element of its own —
 * a nested form would submit the dialog's.
 */

const FIELD = "mt-1 h-9 text-[13px]";
const LABEL = "text-[12.5px]";
const BOX = "mb-3 grid gap-2 rounded-[10px] border border-border px-3 py-2.5";

/** Name, phone and email for someone new; the email is needed. */
export function NewCustomerForm({
    initial,
    onAdd,
    onCancel,
}: {
    initial: NewCustomerDraft;
    onAdd: (draft: NewCustomerDraft) => Promise<void>;
    onCancel: () => void;
}) {
    const ids = { name: useId(), phone: useId(), email: useId() };
    const [draft, setDraft] = useState(initial);
    const [error, setError] = useState<string | null>(null);
    const [checking, setChecking] = useState(false);
    const set = (key: keyof NewCustomerDraft) => (value: string) =>
        setDraft((d) => ({ ...d, [key]: value }));

    async function submit() {
        if (!EMAIL.test(draft.email.trim())) {
            setError("Add their email, like priya@example.com.");
            return;
        }
        setError(null);
        setChecking(true);
        await onAdd(draft);
        setChecking(false);
    }

    return (
        <div
            role="group"
            aria-label="New customer"
            className={BOX}
            onKeyDown={(e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    void submit();
                }
            }}
        >
            <div>
                <Label htmlFor={ids.name} className={LABEL}>
                    Name
                </Label>
                <Input
                    id={ids.name}
                    value={draft.name}
                    onChange={(e) => set("name")(e.target.value)}
                    autoComplete="off"
                    className={FIELD}
                />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
                <div>
                    <Label htmlFor={ids.phone} className={LABEL}>
                        Phone
                    </Label>
                    <Input
                        id={ids.phone}
                        type="tel"
                        value={draft.phone}
                        onChange={(e) => set("phone")(e.target.value)}
                        autoComplete="off"
                        className={FIELD}
                    />
                </div>
                <div>
                    <Label htmlFor={ids.email} className={LABEL}>
                        Email
                    </Label>
                    <Input
                        id={ids.email}
                        type="email"
                        value={draft.email}
                        onChange={(e) => set("email")(e.target.value)}
                        autoComplete="off"
                        aria-invalid={error ? true : undefined}
                        aria-describedby={`${ids.email}-hint`}
                        className={FIELD}
                    />
                </div>
            </div>
            <p
                id={`${ids.email}-hint`}
                role={error ? "alert" : undefined}
                className={
                    error
                        ? "text-[11.5px] font-medium text-destructive-subtle-foreground"
                        : "text-[11.5px] text-muted-foreground"
                }
            >
                {error ??
                    "Every customer is kept by their email, so it's needed to add them."}
            </p>
            <div className="flex justify-end gap-2">
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onCancel}
                >
                    Cancel
                </Button>
                <Button
                    type="button"
                    size="sm"
                    disabled={checking}
                    onClick={() => void submit()}
                >
                    {checking ? "Checking…" : "Add customer"}
                </Button>
            </div>
        </div>
    );
}

/** A walk-in: a name, and a phone if they give one. No record is made. */
export function WalkInForm({
    initial,
    onUse,
    onCancel,
}: {
    initial: NewCustomerDraft;
    onUse: (walkIn: { name: string; phone: string }) => void;
    onCancel: () => void;
}) {
    const ids = { name: useId(), phone: useId() };
    const [name, setName] = useState(initial.name);
    const [phone, setPhone] = useState(initial.phone);
    const ready = name.trim().length > 0;
    return (
        <div role="group" aria-label="Walk-in" className={BOX}>
            <div className="grid gap-2 sm:grid-cols-2">
                <div>
                    <Label htmlFor={ids.name} className={LABEL}>
                        Name
                    </Label>
                    <Input
                        id={ids.name}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        autoComplete="off"
                        className={FIELD}
                    />
                </div>
                <div>
                    <Label htmlFor={ids.phone} className={LABEL}>
                        Phone (if they give one)
                    </Label>
                    <Input
                        id={ids.phone}
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        autoComplete="off"
                        className={FIELD}
                    />
                </div>
            </div>
            <div className="flex justify-end gap-2">
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onCancel}
                >
                    Cancel
                </Button>
                <Button
                    type="button"
                    size="sm"
                    disabled={!ready}
                    onClick={() =>
                        onUse({ name: name.trim(), phone: phone.trim() })
                    }
                >
                    Use walk-in
                </Button>
            </div>
        </div>
    );
}

/** "‹Name› has this phone": the same person, or someone new? */
export function DuplicateWarning({
    match,
    onPickThem,
    onAddAnyway,
}: {
    match: CustomerSearchResult;
    onPickThem: () => void;
    onAddAnyway: () => void;
}) {
    const who = resultLabel(match);
    return (
        <div
            role="alert"
            className="mb-3 grid gap-2 rounded-[10px] bg-warning-subtle px-3 py-2.5 text-[12.5px] leading-[1.45] text-warning-subtle-foreground"
        >
            <p>
                {who} already has this phone. Likely the same person — pick
                them, or add someone new anyway.
            </p>
            <div className="flex flex-wrap justify-end gap-2">
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onAddAnyway}
                >
                    Add someone new
                </Button>
                <Button type="button" size="sm" onClick={onPickThem}>
                    Pick {who}
                </Button>
            </div>
        </div>
    );
}
