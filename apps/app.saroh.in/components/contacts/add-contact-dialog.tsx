"use client";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import type { ReactElement } from "react";
import { useId, useState } from "react";

import { FormSheet } from "@/components/shared/form-sheet";
import { runAction } from "@/lib/api/run-action";
import { createContact } from "@/lib/contacts/create";
import { personHref } from "@/lib/contacts/person-href";

/** A contact just added, as a picker names it. */
export interface AddedContact {
    id: string;
    name: string;
    email: string;
}

/**
 * Add someone the business met, at the counter or on the phone, before they
 * enquire or buy. A side sheet: four fields, committed on its button. The
 * email is the one thing required, because it is how every later enquiry,
 * lead and order finds them.
 *
 * Nobody is sent away: the merchant stays on the list, and the toast has
 * the way to the new contact. Elsewhere (Who on a new invoice, UX-047)
 * `onAdded` takes the new contact, with its own trigger and words.
 */
export function AddContactDialog({
    onAdded,
    trigger,
    description = "Someone you met who has not enquired or bought yet. Saroh will not mail them for you.",
    openOnArrival = false,
}: {
    onAdded?: (contact: AddedContact) => void;
    trigger?: ReactElement;
    description?: string;
    /**
     * Open on arrival (`/contacts?new=1`): where setup lands someone who
     * chose to keep track of people first.
     */
    openOnArrival?: boolean;
} = {}) {
    const router = useRouter();
    const [open, setOpen] = useState(openOnArrival);
    const [fields, setFields] = useState({
        name: "",
        email: "",
        phone: "",
        company: "",
    });
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const ids = {
        name: useId(),
        email: useId(),
        phone: useId(),
        company: useId(),
    };
    const set = (k: keyof typeof fields, v: string) =>
        setFields((f) => ({ ...f, [k]: v }));

    const blank = { name: "", email: "", phone: "", company: "" };

    async function submit() {
        if (!/^\S+@\S+\.\S+$/.test(fields.email.trim())) {
            setError("An email address. It is how their enquiries find them.");
            return;
        }
        setError(null);
        const [firstName, ...rest] = fields.name.trim().split(/\s+/);
        const res = await runAction(
            () =>
                createContact({
                    email: fields.email.trim(),
                    ...(firstName ? { firstName } : {}),
                    ...(rest.length ? { lastName: rest.join(" ") } : {}),
                    ...(fields.phone.trim()
                        ? { phone: fields.phone.trim() }
                        : {}),
                    ...(fields.company.trim()
                        ? { company: fields.company.trim() }
                        : {}),
                }),
            { setBusy: setSaving },
        );
        if (!res) return;
        if (!res.ok) {
            setError(res.error);
            if (!res.error.includes("already")) showError(res.error);
            return;
        }
        const name = fields.name.trim() || fields.email.trim();
        const id = res.data.id;
        setOpen(false);
        setFields(blank);
        if (onAdded) {
            showSuccess("Contact added.");
            onAdded({ id, name, email: fields.email.trim() });
            return;
        }
        // They stay on the list, with the way to the new contact.
        showSuccess("Contact added.", name, {
            label: "Open contact",
            onClick: () => router.push(personHref(id)),
        });
        if (openOnArrival) router.replace("/contacts");
        router.refresh();
    }

    return (
        <FormSheet
            open={open}
            trigger={trigger ?? <Button>New contact</Button>}
            title="Add contact"
            description={description}
            pending={saving}
            saveLabel="Add contact"
            savingLabel="Adding…"
            fieldsClassName="gap-4"
            onOpen={() => setOpen(true)}
            onClose={() => {
                setOpen(false);
                // Opened by `?new=1`: once closed, the list's own address,
                // so a reload doesn't open it again.
                if (openOnArrival) router.replace("/contacts");
                setFields(blank);
                setError(null);
            }}
            onSubmit={submit}
        >
            <div className="grid gap-1.5">
                <Label htmlFor={ids.name}>Name</Label>
                <Input
                    id={ids.name}
                    value={fields.name}
                    placeholder="Meera Shah"
                    autoComplete="off"
                    onChange={(e) => set("name", e.target.value)}
                />
            </div>
            <div className="grid gap-1.5">
                <Label htmlFor={ids.email}>Email</Label>
                <Input
                    id={ids.email}
                    type="email"
                    value={fields.email}
                    placeholder="meera@example.com"
                    aria-invalid={Boolean(error)}
                    onChange={(e) => set("email", e.target.value)}
                />
                {error ? (
                    <p
                        role="alert"
                        className="text-[12.5px] font-medium text-destructive-subtle-foreground"
                    >
                        {error}
                    </p>
                ) : null}
            </div>
            <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                    <Label htmlFor={ids.phone}>
                        Phone{" "}
                        <span className="font-normal text-muted-foreground">
                            optional
                        </span>
                    </Label>
                    <Input
                        id={ids.phone}
                        type="tel"
                        value={fields.phone}
                        onChange={(e) => set("phone", e.target.value)}
                    />
                </div>
                <div className="grid gap-1.5">
                    <Label htmlFor={ids.company}>
                        Company{" "}
                        <span className="font-normal text-muted-foreground">
                            optional
                        </span>
                    </Label>
                    <Input
                        id={ids.company}
                        value={fields.company}
                        onChange={(e) => set("company", e.target.value)}
                    />
                </div>
            </div>
        </FormSheet>
    );
}
