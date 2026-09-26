"use client";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetTitle,
} from "@saroh/ui/sheet";
import { showError, showUndo } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { updateContact } from "@/lib/contacts/actions";

export interface Details {
    firstName: string;
    lastName: string;
    phone: string;
    company: string;
}

const FIELDS: {
    key: keyof Details;
    label: string;
    type: string;
    note?: string;
}[] = [
    { key: "firstName", label: "First name", type: "text" },
    { key: "lastName", label: "Last name", type: "text" },
    { key: "phone", label: "Phone", type: "tel" },
    { key: "company", label: "Company", type: "text" },
];

/**
 * Edit details, as the design's side sheet: the fields, Save with Undo, and
 * a question before unsaved changes are thrown away. The email is shown but
 * not edited — it is how their enquiries, bookings and store customers find
 * them, and changing it would quietly split one person into two.
 */
export function EditSheet({
    open,
    onOpenChange,
    contactId,
    email,
    initial,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    contactId: string;
    email: string;
    initial: Details;
}) {
    const router = useRouter();
    const [fields, setFields] = useState(initial);
    const [asking, setAsking] = useState(false);
    const [saving, setSaving] = useState(false);
    const id = useId();
    const changed = (Object.keys(fields) as (keyof Details)[]).filter(
        (k) => fields[k].trim() !== initial[k],
    );
    const dirty = changed.length > 0;
    const nameBad = !fields.firstName.trim() && !fields.lastName.trim();

    const close = (force = false) => {
        if (dirty && !force) {
            setAsking(true);
            return;
        }
        setAsking(false);
        onOpenChange(false);
    };

    async function save() {
        if (!dirty || nameBad) return;
        setSaving(true);
        const input = Object.fromEntries(
            changed.map((k) => [k, fields[k].trim()]),
        );
        const before = Object.fromEntries(changed.map((k) => [k, initial[k]]));
        const res = await updateContact(contactId, input);
        setSaving(false);
        if (!res.ok) return showError(res.error);
        onOpenChange(false);
        router.refresh();
        showUndo("Details saved.", () => {
            void updateContact(contactId, before).then((back) => {
                if (!back.ok) showError(back.error);
                router.refresh();
            });
        });
    }

    return (
        <Sheet
            open={open}
            // Opened by the page, which remounts it each time (a fresh draft).
            onOpenChange={(o) => (o ? onOpenChange(true) : close())}
        >
            <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-[440px]">
                <div className="border-b border-border px-[18px] py-3.5">
                    <SheetTitle className="font-display text-[18px] font-semibold">
                        Edit details
                    </SheetTitle>
                    <SheetDescription className="sr-only">
                        Change their name, phone and company.
                    </SheetDescription>
                </div>
                <form
                    id={id}
                    onSubmit={(e) => {
                        e.preventDefault();
                        void save();
                    }}
                    className="flex flex-1 flex-col gap-3.5 overflow-y-auto px-[18px] py-4"
                >
                    {FIELDS.map((f) => {
                        const bad = f.key === "firstName" && nameBad;
                        return (
                            <div key={f.key} className="grid gap-1.5">
                                <Label
                                    htmlFor={`${id}-${f.key}`}
                                    className="text-[12.5px] font-medium"
                                >
                                    {f.label}
                                </Label>
                                <Input
                                    id={`${id}-${f.key}`}
                                    type={f.type}
                                    value={fields[f.key]}
                                    aria-invalid={bad || undefined}
                                    maxLength={f.key === "phone" ? 40 : 160}
                                    onChange={(e) =>
                                        setFields((x) => ({
                                            ...x,
                                            [f.key]: e.target.value,
                                        }))
                                    }
                                    className="h-[38px] rounded-[9px] text-[14px]"
                                />
                                {bad ? (
                                    <span className="text-[11.5px] text-destructive-subtle-foreground">
                                        A customer needs a name.
                                    </span>
                                ) : null}
                            </div>
                        );
                    })}
                    <div className="grid gap-1.5">
                        <span className="text-[12.5px] font-medium">Email</span>
                        <span className="text-[14px]">{email}</span>
                        <span className="text-[11.5px] text-muted-foreground">
                            Stays as it is — it is how their enquiries, bookings
                            and orders find them.
                        </span>
                    </div>
                </form>
                {asking ? (
                    <div
                        role="alert"
                        className="flex flex-wrap items-center gap-2 border-t border-border bg-brand-subtle px-[18px] py-2.5"
                    >
                        <span className="flex-[1_1_180px] text-[12.5px] text-brand-subtle-foreground">
                            You have changes that are not saved.
                        </span>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => close(true)}
                            className="h-[30px] rounded-[8px] px-[11px] text-[12px] font-semibold text-destructive-subtle-foreground coarse:h-11"
                        >
                            Discard
                        </Button>
                        <Button
                            type="button"
                            onClick={() => setAsking(false)}
                            className="h-[30px] rounded-[8px] px-[11px] text-[12px] font-semibold coarse:h-11"
                        >
                            Keep editing
                        </Button>
                    </div>
                ) : null}
                <div className="flex items-center gap-2 border-t border-border px-[18px] py-3">
                    <span className="flex-1 text-[12px] text-muted-foreground">
                        {dirty ? "" : "No changes yet"}
                    </span>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => close()}
                        className="h-8 rounded-[9px] px-3 text-[12.5px] font-semibold coarse:h-11"
                    >
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        form={id}
                        disabled={!dirty || nameBad || saving}
                        className="h-8 rounded-[9px] px-3 text-[12.5px] font-semibold coarse:h-11"
                    >
                        {saving ? "Saving…" : "Save"}
                    </Button>
                </div>
            </SheetContent>
        </Sheet>
    );
}
