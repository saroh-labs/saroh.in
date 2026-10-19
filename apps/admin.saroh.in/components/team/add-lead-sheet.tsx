"use client";

import { Button } from "@saroh/ui/button";
import { DateInput } from "@saroh/ui/date-picker";
import { Field } from "@saroh/ui/field";
import { Input } from "@saroh/ui/input";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetFooter,
    SheetHeader,
    SheetTitle,
} from "@saroh/ui/sheet";
import { Textarea } from "@saroh/ui/textarea";
import { useState, useTransition } from "react";

import { todayIso } from "@/lib/format";
import { addLeadAction } from "@/lib/saroh-lead-actions";
import type { LeadCard } from "@/lib/saroh-lead-words";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Add one of Saroh's own leads (DEC-169, U20). A manager owns what they
 * add; Support adds it unowned, to give out. An email already on a lead is
 * refused by the API, which says whose it is: the first to record an email
 * owns it. That refusal sits under the email field.
 */
export function AddLeadSheet({
    ownScope,
    onOpenChange,
    onAdded,
}: {
    /** An Account manager: the lead will be theirs. */
    ownScope: boolean;
    onOpenChange: (open: boolean) => void;
    onAdded: (lead: LeadCard) => void;
}) {
    const [key] = useState(() => crypto.randomUUID());
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [city, setCity] = useState("");
    const [followUpOn, setFollowUpOn] = useState("");
    const [notes, setNotes] = useState("");
    const [errors, setErrors] = useState<{
        name?: string;
        email?: string;
        form?: string;
    }>({});
    const [pending, startTransition] = useTransition();

    function submit(event: React.FormEvent) {
        event.preventDefault();
        const found: typeof errors = {};
        if (!name.trim()) found.name = "Give the lead a name.";
        if (email.trim() && !EMAIL.test(email.trim())) {
            found.email = "That email doesn't look right.";
        }
        setErrors(found);
        if (found.name || found.email) return;
        startTransition(async () => {
            const result = await addLeadAction({
                name: name.trim(),
                email: email.trim() || null,
                phone: phone.trim() || null,
                city: city.trim() || null,
                followUpOn: followUpOn || null,
                notes: notes.trim() || null,
                idempotencyKey: key,
            });
            if (!result.ok) {
                setErrors(
                    result.status === 409
                        ? { email: result.error }
                        : { form: result.error },
                );
                return;
            }
            onAdded(result.data);
            onOpenChange(false);
        });
    }

    return (
        <Sheet open onOpenChange={onOpenChange}>
            <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-md">
                <form
                    onSubmit={submit}
                    noValidate
                    className="flex flex-1 flex-col gap-4"
                >
                    <SheetHeader>
                        <SheetTitle>Add a lead</SheetTitle>
                        <SheetDescription>
                            {ownScope
                                ? "It's yours from the start. If its email is already a lead, you'll be told whose."
                                : "It starts with nobody. Give it to an account manager from its sheet."}
                        </SheetDescription>
                    </SheetHeader>
                    <Field label="Business or person" error={errors.name}>
                        <Input
                            name="name"
                            autoComplete="off"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                        />
                    </Field>
                    <Field
                        label="Email"
                        optional
                        hint="The first teammate to record an email owns the lead."
                        error={errors.email}
                    >
                        <Input
                            name="email"
                            type="email"
                            autoComplete="off"
                            placeholder="first.last@example.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                    </Field>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Phone" optional>
                            <Input
                                name="phone"
                                type="tel"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                            />
                        </Field>
                        <Field label="City" optional>
                            <Input
                                name="city"
                                value={city}
                                onChange={(e) => setCity(e.target.value)}
                            />
                        </Field>
                    </div>
                    <Field label="Follow up on" optional>
                        <DateInput
                            name="followUpOn"
                            min={todayIso()}
                            className="w-full"
                            value={followUpOn}
                            onValueChange={setFollowUpOn}
                            clearable
                            placeholder="No follow-up"
                        />
                    </Field>
                    <Field label="Notes" optional>
                        <Textarea
                            name="notes"
                            rows={3}
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                        />
                    </Field>
                    {errors.form ? (
                        <p role="alert" className="text-sm text-destructive">
                            {errors.form}
                        </p>
                    ) : null}
                    <SheetFooter className="mt-auto gap-2">
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => onOpenChange(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            busy={pending}
                            busyLabel="Adding…"
                        >
                            Add lead
                        </Button>
                    </SheetFooter>
                </form>
            </SheetContent>
        </Sheet>
    );
}
