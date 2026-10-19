"use client";

import { Button } from "@saroh/ui/button";
import { DateInput } from "@saroh/ui/date-picker";
import { Field } from "@saroh/ui/field";
import { Input } from "@saroh/ui/input";
import { phoneNumberProblem } from "@saroh/ui/lib/phone";
import { PhoneInput } from "@saroh/ui/phone-input";
import { Textarea } from "@saroh/ui/textarea";
import { useState, useTransition } from "react";

import { todayIso } from "@/lib/format";
import { updateLeadAction } from "@/lib/saroh-lead-actions";
import type { LeadCard, LeadDetail } from "@/lib/saroh-lead-words";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Draft = Record<
    | "name"
    | "email"
    | "signUpEmail"
    | "phone"
    | "city"
    | "followUpOn"
    | "notes",
    string
>;

const draftOf = (lead: LeadDetail): Draft => ({
    name: lead.name,
    email: lead.email ?? "",
    signUpEmail: lead.signUpEmail ?? "",
    phone: lead.phone ?? "",
    city: lead.city ?? "",
    followUpOn: lead.followUpOn ?? "",
    notes: lead.notes ?? "",
});

/**
 * Edit a lead's details in its sheet (DEC-169, U20): name, emails, phone,
 * city, follow-up and notes. Only what changed is sent; an email another
 * lead has is refused by the API, saying whose, under that field.
 */
export function LeadDetailsForm({
    lead,
    onSaved,
    onCancel,
}: {
    lead: LeadDetail;
    onSaved: (card: LeadCard) => void;
    onCancel: () => void;
}) {
    const [key] = useState(() => crypto.randomUUID());
    const [draft, setDraft] = useState<Draft>(() => draftOf(lead));
    const [errors, setErrors] = useState<
        Partial<Record<keyof Draft | "form", string>>
    >({});
    const [pending, startTransition] = useTransition();
    const before = draftOf(lead);

    const set =
        (field: keyof Draft) =>
        (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
            setDraft((now) => ({ ...now, [field]: e.target.value }));

    function submit(event: React.FormEvent) {
        event.preventDefault();
        const found: typeof errors = {};
        if (!draft.name.trim()) found.name = "Give the lead a name.";
        for (const field of ["email", "signUpEmail"] as const) {
            const value = draft[field].trim();
            if (value && !EMAIL.test(value)) {
                found[field] = "That email doesn't look right.";
            }
        }
        if (draft.phone !== before.phone) {
            const phone = phoneNumberProblem(draft.phone);
            if (phone) found.phone = phone;
        }
        setErrors(found);
        if (Object.keys(found).length > 0) return;

        const changed: Record<string, string | null> = {};
        for (const field of Object.keys(draft) as (keyof Draft)[]) {
            if (draft[field].trim() !== before[field].trim()) {
                changed[field] =
                    field === "name"
                        ? draft.name.trim()
                        : draft[field].trim() || null;
            }
        }
        if (Object.keys(changed).length === 0) {
            onCancel();
            return;
        }
        startTransition(async () => {
            const result = await updateLeadAction({
                id: lead.id,
                ...changed,
                idempotencyKey: key,
            });
            if (!result.ok) {
                const field =
                    result.status === 409
                        ? "signUpEmail" in changed && !("email" in changed)
                            ? "signUpEmail"
                            : "email"
                        : "form";
                setErrors({ [field]: result.error });
                return;
            }
            onSaved(result.data);
        });
    }

    return (
        <form onSubmit={submit} noValidate className="grid gap-3">
            <Field label="Business or person" error={errors.name}>
                <Input name="name" value={draft.name} onChange={set("name")} />
            </Field>
            <Field label="Email" optional error={errors.email}>
                <Input
                    name="email"
                    type="email"
                    value={draft.email}
                    onChange={set("email")}
                />
            </Field>
            <Field
                label="Sign-up email"
                optional
                hint="The email the business signs up with, when it isn't the one above."
                error={errors.signUpEmail}
            >
                <Input
                    name="signUpEmail"
                    type="email"
                    value={draft.signUpEmail}
                    onChange={set("signUpEmail")}
                />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Phone" optional error={errors.phone}>
                    <PhoneInput
                        name="phone"
                        value={draft.phone}
                        onValueChange={(phone) =>
                            setDraft((now) => ({ ...now, phone }))
                        }
                    />
                </Field>
                <Field label="City" optional>
                    <Input
                        name="city"
                        value={draft.city}
                        onChange={set("city")}
                    />
                </Field>
            </div>
            <Field label="Follow up on" optional>
                <DateInput
                    name="followUpOn"
                    min={todayIso()}
                    className="w-full"
                    value={draft.followUpOn}
                    onValueChange={(v) =>
                        setDraft((now) => ({ ...now, followUpOn: v }))
                    }
                    clearable
                    placeholder="No follow-up"
                />
            </Field>
            <Field label="Notes" optional>
                <Textarea
                    name="notes"
                    rows={3}
                    value={draft.notes}
                    onChange={set("notes")}
                />
            </Field>
            {errors.form ? (
                <p role="alert" className="text-sm text-destructive">
                    {errors.form}
                </p>
            ) : null}
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
                    type="submit"
                    size="sm"
                    busy={pending}
                    busyLabel="Saving…"
                >
                    Save details
                </Button>
            </div>
        </form>
    );
}
