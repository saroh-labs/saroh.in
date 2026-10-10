"use client";

import { FormSheet } from "@/components/shared/form-sheet";
import { showError, showUndo } from "@saroh/ui/toast";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { personHref } from "@/lib/contacts/person-href";
import { saveDetailsAction } from "@/lib/customer-workspace/actions";
import type { CustomerDetail } from "@/lib/customer-workspace/detail";
import type {
    DetailsDraft,
    DetailsKey,
} from "@/lib/customer-workspace/details";
import {
    detailsPatch,
    detailsProblems,
    draftFrom,
    signInNote,
} from "@/lib/customer-workspace/details";
import type { EmailHolder } from "@/lib/customer-workspace/service";

import { AddressFields, TextField } from "./edit-fields";

interface Refusal {
    field: DetailsKey;
    message: string;
    holder?: EmailHolder;
}

/**
 * Edit details, as the design's side sheet (C8): name, email, phone,
 * company and the delivery address, and Save with Undo. It is the app's
 * one sheet frame (`FormSheet`): a press outside does nothing once
 * something is typed, and Cancel, Escape and the close button drop it.
 *
 * The email is unique per business: one another customer holds is refused
 * on the field, naming them. When they sign in on the website, the sheet
 * says that sign-in keeps its own email (DEC-049, ADR-011).
 */
export function EditSheet({
    open,
    onOpenChange,
    contact,
    signsInWith,
    onMerge,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    contact: CustomerDetail["contact"];
    /** Their website account's email, when they sign in. */
    signsInWith: string | null;
    /** Offer to merge with whoever holds the email (`customer:merge`). */
    onMerge?: (holder: EmailHolder) => void;
}) {
    const router = useRouter();
    const [initial] = useState(() => draftFrom(contact));
    const [draft, setDraft] = useState(initial);
    const [refusal, setRefusal] = useState<Refusal | null>(null);
    // What is wrong is said once Save is pressed, then as each is fixed.
    const [tried, setTried] = useState(false);
    const [saving, setSaving] = useState(false);
    const id = useId();
    const patch = detailsPatch(initial, draft);
    const dirty = Object.keys(patch).length > 0;
    const problems = detailsProblems(draft);
    const blocked = Object.keys(problems).length > 0;
    const errors: Partial<Record<DetailsKey, string>> = {
        ...(tried ? problems : {}),
        ...(refusal ? { [refusal.field]: refusal.message } : {}),
    };

    const set = (k: DetailsKey, value: string) => {
        setDraft((x) => ({ ...x, [k]: value }));
        setRefusal((r) => (r?.field === k ? null : r));
    };

    const close = () => onOpenChange(false);

    async function save() {
        setTried(true);
        if (blocked || saving) return;
        setSaving(true);
        const res = await saveDetailsAction(contact.id, patch);
        setSaving(false);
        if (!res.ok) {
            if (res.field && res.field in initial) {
                setRefusal({
                    field: res.field as DetailsKey,
                    message: res.error,
                    holder: res.holder,
                });
                return;
            }
            return showError(res.error);
        }
        onOpenChange(false);
        router.refresh();
        const before = Object.fromEntries(
            (Object.keys(patch) as DetailsKey[]).map((k) => [k, initial[k]]),
        ) as Partial<DetailsDraft>;
        showUndo("Details saved.", async () => {
            const back = await saveDetailsAction(contact.id, before);
            router.refresh();
            return back;
        });
    }

    const common = { id, draft, set };
    const holder = refusal?.holder;
    const emailNote =
        holder && onMerge ? (
            // The same person twice (C10): offer the merge, which lets them
            // pick this email for the record that stays. What was typed here
            // can't be saved as it stands, so the sheet makes way for it.
            <button
                type="button"
                onClick={() => {
                    close();
                    onMerge(holder);
                }}
                className="cursor-pointer rounded-sm font-medium text-foreground underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:opacity-70"
            >
                Merge with {holder.name ?? "their record"}
            </button>
        ) : holder ? (
            <Link
                href={personHref(holder.contactId)}
                className="rounded-sm font-medium text-foreground underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:opacity-70"
            >
                See {holder.name ?? "their record"}
            </Link>
        ) : signsInWith ? (
            signInNote(signsInWith)
        ) : (
            "Receipts go here."
        );

    return (
        <FormSheet
            // Opened by the page, which remounts it each time (a fresh draft).
            id={id}
            open={open}
            title="Edit details"
            description="Their name, email, phone, company and delivery address."
            pending={saving}
            dirty={dirty}
            fieldsClassName="gap-3.5"
            onClose={close}
            onSubmit={save}
        >
            <TextField
                {...common}
                k="firstName"
                label="First name"
                maxLength={120}
                error={errors.firstName}
            />
            <TextField
                {...common}
                k="lastName"
                label="Last name"
                maxLength={120}
            />{" "}
            <TextField
                {...common}
                k="email"
                label="Email"
                type="email"
                maxLength={200}
                autoComplete="off"
                error={errors.email}
                note={emailNote}
            />
            {refusal?.field === "email" && refusal.holder ? (
                <span className="-mt-2 text-[11.5px] text-muted-foreground">
                    {emailNote}
                </span>
            ) : null}
            <TextField
                {...common}
                k="phone"
                label="Phone"
                type="tel"
                maxLength={40}
                error={errors.phone}
            />
            <TextField
                {...common}
                k="company"
                label="Company"
                maxLength={160}
                error={errors.company}
            />
            <AddressFields {...common} errors={errors} />
        </FormSheet>
    );
}
