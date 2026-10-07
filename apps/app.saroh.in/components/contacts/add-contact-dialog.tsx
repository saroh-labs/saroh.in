"use client";

import { Button } from "@saroh/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@saroh/ui/dialog";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { showError, showSuccess } from "@saroh/ui/toast";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useId, useState } from "react";

import { createContact } from "@/lib/contacts/create";

/** A contact just added, as a picker names it. */
export interface AddedContact {
    id: string;
    name: string;
    email: string;
}

/**
 * Add someone the business met — at the counter, on the phone — before they
 * enquire or buy. A dialog: a handful of fields, one decision, committed on
 * Save. The email is the one thing required, because it is how every later
 * enquiry, lead and order finds them.
 *
 * From Contacts it opens the new contact. Elsewhere (Who on a new invoice,
 * UX-047) `onAdded` takes the new contact instead, so the merchant stays
 * where they were, with its own trigger and words.
 */
export function AddContactDialog({
    onAdded,
    trigger,
    description = "Someone you met who has not enquired or bought yet. Saroh will not mail them for you.",
}: {
    onAdded?: (contact: AddedContact) => void;
    trigger?: ReactNode;
    description?: string;
} = {}) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
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

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        if (!/^\S+@\S+\.\S+$/.test(fields.email.trim())) {
            setError("An email address — it is how their enquiries find them.");
            return;
        }
        setError(null);
        const [firstName, ...rest] = fields.name.trim().split(/\s+/);
        setSaving(true);
        const res = await createContact({
            email: fields.email.trim(),
            ...(firstName ? { firstName } : {}),
            ...(rest.length ? { lastName: rest.join(" ") } : {}),
            ...(fields.phone.trim() ? { phone: fields.phone.trim() } : {}),
            ...(fields.company.trim()
                ? { company: fields.company.trim() }
                : {}),
        });
        setSaving(false);
        if (!res.ok) {
            setError(res.error);
            if (!res.error.includes("already")) showError(res.error);
            return;
        }
        const name = fields.name.trim() || fields.email.trim();
        setOpen(false);
        setFields({ name: "", email: "", phone: "", company: "" });
        showSuccess(`${name} added`);
        if (onAdded) {
            onAdded({ id: res.data.id, name, email: fields.email.trim() });
            return;
        }
        router.push(`/contacts/${res.data.id}`);
    }

    return (
        <Dialog
            open={open}
            onOpenChange={(o) => {
                setOpen(o);
                if (!o) setError(null);
            }}
        >
            <DialogTrigger asChild>
                {trigger ?? (
                    <Button>
                        <Plus className="mr-1.5 size-4" />
                        Add contact
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="max-w-[440px]">
                <form onSubmit={(e) => void submit(e)} className="space-y-4">
                    <DialogHeader>
                        <DialogTitle className="font-display text-[19px] tracking-[-0.025em]">
                            Add contact
                        </DialogTitle>
                        <DialogDescription>{description}</DialogDescription>
                    </DialogHeader>
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
                            <p className="text-[11.5px] leading-[1.5] text-destructive">
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
                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" disabled={saving}>
                            {saving ? "Adding…" : "Add contact"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
