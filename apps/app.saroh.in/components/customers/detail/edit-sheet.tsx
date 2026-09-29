"use client";

import { Button } from "@saroh/ui/button";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetTitle,
} from "@saroh/ui/sheet";
import { showError, showUndo } from "@saroh/ui/toast";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

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
 * company and the delivery address, Save with Undo, and a question before
 * unsaved changes are thrown away.
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
    const [asking, setAsking] = useState(false);
    const [saving, setSaving] = useState(false);
    const id = useId();
    const patch = detailsPatch(initial, draft);
    const dirty = Object.keys(patch).length > 0;
    const problems = detailsProblems(draft);
    const blocked = Object.keys(problems).length > 0;
    const errors: Partial<Record<DetailsKey, string>> = {
        ...problems,
        ...(refusal ? { [refusal.field]: refusal.message } : {}),
    };

    const set = (k: DetailsKey, value: string) => {
        setDraft((x) => ({ ...x, [k]: value }));
        setRefusal((r) => (r?.field === k ? null : r));
    };

    const close = (force = false) => {
        if (dirty && !force) {
            setAsking(true);
            return;
        }
        setAsking(false);
        onOpenChange(false);
    };

    async function save() {
        if (!dirty || blocked || saving) return;
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
        showUndo("Details saved.", () => {
            void saveDetailsAction(contact.id, before).then((back) => {
                if (!back.ok) showError(back.error);
                router.refresh();
            });
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
                    close(true);
                    onMerge(holder);
                }}
                className="cursor-pointer rounded-sm font-medium text-foreground underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:opacity-70"
            >
                Merge with {holder.name ?? "their record"}
            </button>
        ) : holder ? (
            <Link
                href={`/customers/${encodeURIComponent(holder.contactId)}`}
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
                        Change their name, email, phone, company and delivery
                        address.
                    </SheetDescription>
                </div>
                <form
                    id={id}
                    noValidate
                    onSubmit={(e) => {
                        e.preventDefault();
                        void save();
                    }}
                    className="flex flex-1 flex-col gap-3.5 overflow-y-auto px-[18px] py-4"
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
                        disabled={!dirty || blocked || saving}
                        className="h-8 rounded-[9px] px-3 text-[12.5px] font-semibold coarse:h-11"
                    >
                        {saving ? "Saving…" : "Save"}
                    </Button>
                </div>
            </SheetContent>
        </Sheet>
    );
}
