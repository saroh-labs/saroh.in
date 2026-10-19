"use client";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { useId, useState } from "react";

import { BusinessPhoneInput } from "@/components/shared/business-phone-input";
import { runAction } from "@/lib/api/run-action";
import type {
    CustomerSearchResult,
    NewCustomerDraft,
} from "@/lib/customers/picker";
import {
    EMAIL,
    resultLabel,
    WALK_IN_PHONE_ERROR,
    walkInCopy,
    walkInPhone,
} from "@/lib/customers/picker";
import { Notice } from "@saroh/ui/notice";

/**
 * The customer picker's small inline forms (E4): someone new, a walk-in
 * (B13), and "is this the same person?". Each sits under the chips, inside
 * whatever dialog holds the picker, so none is a form element of its own —
 * a nested form would submit the dialog's.
 */

const FIELD = "mt-1";
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
        await runAction(() => onAdd(draft), { setBusy: setChecking });
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
                <Label htmlFor={ids.name}>Name</Label>
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
                    <Label htmlFor={ids.phone}>Phone</Label>
                    <BusinessPhoneInput
                        id={ids.phone}
                        value={draft.phone}
                        onValueChange={set("phone")}
                        autoComplete="off"
                        className={FIELD}
                    />
                </div>
                <div>
                    <Label htmlFor={ids.email}>Email</Label>
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
                    onClick={() => void submit()}
                    busy={checking}
                    busyLabel="Checking…"
                >
                    Add customer
                </Button>
            </div>
        </div>
    );
}

/**
 * A walk-in: a name, and a phone if they give one. A name alone makes no
 * record; a phone keeps them as a customer (B13b), which the line under the
 * fields and the button both say.
 */
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
    const [error, setError] = useState<string | null>(null);
    const ready = name.trim().length > 0;
    const copy = walkInCopy(phone);

    function use() {
        if (!ready) return;
        if (walkInPhone(phone) === "short") {
            setError(WALK_IN_PHONE_ERROR);
            return;
        }
        setError(null);
        onUse({ name: name.trim(), phone: phone.trim() });
    }

    return (
        <div
            role="group"
            aria-label="Walk-in"
            className={BOX}
            onKeyDown={(e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    use();
                }
            }}
        >
            <div className="grid gap-2 sm:grid-cols-2">
                <div>
                    <Label htmlFor={ids.name}>Name</Label>
                    <Input
                        id={ids.name}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        autoComplete="off"
                        className={FIELD}
                    />
                </div>
                <div>
                    <Label htmlFor={ids.phone}>Phone (if they give one)</Label>
                    <BusinessPhoneInput
                        id={ids.phone}
                        value={phone}
                        onValueChange={(v) => {
                            setPhone(v);
                            setError(null);
                        }}
                        autoComplete="off"
                        aria-invalid={error ? true : undefined}
                        aria-describedby={`${ids.phone}-hint`}
                        className={FIELD}
                    />
                </div>
            </div>
            <p
                id={`${ids.phone}-hint`}
                role={error ? "alert" : undefined}
                aria-live={error ? undefined : "polite"}
                className={
                    error
                        ? "text-[11.5px] font-medium text-destructive-subtle-foreground"
                        : "text-[11.5px] text-muted-foreground"
                }
            >
                {error ?? copy.hint}
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
                <Button type="button" size="sm" disabled={!ready} onClick={use}>
                    {copy.action}
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
        <Notice tone="warning" role="alert" className="mb-3">
            <div className="grid gap-2">
                <p>
                    {who} already has this phone. Likely the same person. Pick
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
                    <Button
                        data-ph-mask=""
                        type="button"
                        size="sm"
                        onClick={onPickThem}
                    >
                        Pick {who}
                    </Button>
                </div>
            </div>
        </Notice>
    );
}
