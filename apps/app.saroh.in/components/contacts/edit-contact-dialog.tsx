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
import { PenLine } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { updateContact } from "@/lib/contacts/actions";

interface Fields {
    firstName: string;
    lastName: string;
    phone: string;
    company: string;
}

/**
 * Change what the business knows about a person. A dialog — a handful of
 * fields and one decision — that commits on Save.
 *
 * The email is not here: it is how a contact is matched to the leads,
 * enquiries and orders that arrive under it, so changing it would quietly
 * split one person into two.
 */
export function EditContactDialog({
    contactId,
    initial,
}: {
    contactId: string;
    initial: Fields;
}) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [fields, setFields] = useState(initial);
    const [saving, setSaving] = useState(false);
    const ids = {
        first: useId(),
        last: useId(),
        phone: useId(),
        company: useId(),
    };
    const set = (k: keyof Fields, v: string) =>
        setFields((f) => ({ ...f, [k]: v }));

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        setSaving(true);
        // Only what changed, so a field nobody touched is left as it was.
        const input = Object.fromEntries(
            (Object.keys(fields) as (keyof Fields)[])
                .filter((k) => fields[k].trim() !== initial[k])
                .map((k) => [k, fields[k].trim()]),
        );
        const res =
            Object.keys(input).length === 0
                ? { ok: true as const }
                : await updateContact(contactId, input);
        setSaving(false);
        if (!res.ok) return showError(res.error);
        setOpen(false);
        showSuccess("Saved");
        router.refresh();
    }

    return (
        <Dialog
            open={open}
            onOpenChange={(o) => {
                setOpen(o);
                if (o) setFields(initial);
            }}
        >
            <DialogTrigger asChild>
                <Button variant="outline">
                    <PenLine className="mr-1.5 size-4" />
                    Edit
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-[440px]">
                <form onSubmit={(e) => void submit(e)} className="space-y-4">
                    <DialogHeader>
                        <DialogTitle className="font-display text-[19px] tracking-[-0.025em]">
                            Edit contact
                        </DialogTitle>
                        <DialogDescription>
                            Their email stays as it is — it is how their leads
                            and orders find them.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="grid gap-1.5">
                            <Label htmlFor={ids.first}>First name</Label>
                            <Input
                                id={ids.first}
                                value={fields.firstName}
                                maxLength={120}
                                onChange={(e) =>
                                    set("firstName", e.target.value)
                                }
                            />
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor={ids.last}>Last name</Label>
                            <Input
                                id={ids.last}
                                value={fields.lastName}
                                maxLength={120}
                                onChange={(e) =>
                                    set("lastName", e.target.value)
                                }
                            />
                        </div>
                    </div>
                    <div className="grid gap-1.5">
                        <Label htmlFor={ids.phone}>Phone</Label>
                        <Input
                            id={ids.phone}
                            type="tel"
                            value={fields.phone}
                            maxLength={40}
                            onChange={(e) => set("phone", e.target.value)}
                        />
                    </div>
                    <div className="grid gap-1.5">
                        <Label htmlFor={ids.company}>Company</Label>
                        <Input
                            id={ids.company}
                            value={fields.company}
                            maxLength={160}
                            onChange={(e) => set("company", e.target.value)}
                        />
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
                            {saving ? "Saving…" : "Save"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
