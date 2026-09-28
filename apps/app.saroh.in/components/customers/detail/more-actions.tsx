"use client";

import { showError, showSuccess } from "@saroh/ui/toast";
import { Unlink } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { deleteContact } from "@/lib/contacts/actions";
import { deletedLine, REMOVED_TOAST } from "@/lib/contacts/removal";
import {
    unlinkAccountAction,
    unlinkPreviewAction,
} from "@/lib/customer-workspace/actions";
import type { CustomerDetail } from "@/lib/customer-workspace/detail";
import type { MergeTarget } from "@/lib/customer-workspace/merge";
import { clashTarget, suggestedTarget } from "@/lib/customer-workspace/merge";
import type { MoreItem } from "@/lib/customer-workspace/more-menu";
import { hasMoneyRecords, moreMenu } from "@/lib/customer-workspace/more-menu";
import type {
    DuplicateSuggestion,
    IdentitySuggestion,
} from "@/lib/customer-workspace/service";
import type { UnlinkPreview } from "@/lib/customer-workspace/site-account";
import {
    unlinkConfirm,
    unlinkedLine,
} from "@/lib/customer-workspace/site-account";

import { IdentityLinkDialog } from "../identity-link-dialog";
import { EditSheet } from "./edit-sheet";
import { MergeDialog } from "./merge-dialog";
import { RemoveDetailsDialog } from "./remove-details-dialog";

/**
 * Edit details and ⋯ More actions on Customer Detail (C10, C11, C14): what
 * the menu holds for this viewer, and the sheet and dialogs each item opens
 * — edit, merge, link a store customer, "This isn't them", delete and the
 * privacy removal. The screen draws the header; this owns what it opens.
 */
export function useMoreActions({
    d,
    name,
    sells,
    canWrite,
    canMerge,
    canRemove,
    suggestions,
    duplicates,
}: {
    d: CustomerDetail;
    name: string;
    /** The business sells: back to Customers, else Contacts. */
    sells: boolean;
    canWrite: boolean;
    canMerge: boolean;
    canRemove: boolean;
    suggestions: IdentitySuggestion[];
    duplicates: DuplicateSuggestion[];
}): {
    menu: MoreItem[];
    edit: () => void;
    link: () => void;
    /** Merge with a suggested duplicate; absent without `customer:merge`. */
    mergeDuplicate?: (dup: DuplicateSuggestion) => void;
    dialogs: React.ReactNode;
} {
    const router = useRouter();
    const [editing, setEditing] = useState(0);
    const [linking, setLinking] = useState(false);
    const [removing, setRemoving] = useState(false);
    // "Remove their details (privacy request)…" (C11).
    const [removingDetails, setRemovingDetails] = useState(false);
    const [notThem, setNotThem] = useState<UnlinkPreview | null>(null);
    // The merge (C10): with the other record known, or null to search.
    // Offered only with `customer:merge`.
    const [merging, setMerging] = useState<{
        target: MergeTarget | null;
    } | null>(null);
    const mergeWith = (target: MergeTarget | null) => setMerging({ target });
    const mergeDuplicate = canMerge
        ? (dup: DuplicateSuggestion) => mergeWith(suggestedTarget(dup))
        : undefined;
    const back = sells ? "/commerce/customers" : "/contacts";

    // "This isn't them" (A4): read what would move, then ask.
    async function askNotThem() {
        const res = await unlinkPreviewAction(d.contact.id);
        if (!res.ok) return showError(res.error);
        setNotThem(res.data);
    }

    async function separate(preview: UnlinkPreview) {
        setNotThem(null);
        const res = await unlinkAccountAction(d.contact.id);
        if (!res.ok) return showError(res.error);
        showSuccess(unlinkedLine(preview.email));
        router.refresh();
    }

    async function remove() {
        setRemoving(false);
        const res = await deleteContact(d.contact.id);
        if (!res.ok) return showError(res.error);
        showSuccess(deletedLine(name, res.data));
        router.push(back);
    }

    // After a privacy removal there is no one left to show: back to the
    // list, in the design's words.
    function removedDetails() {
        setRemovingDetails(false);
        showSuccess(REMOVED_TOAST);
        router.push(back);
    }

    const menu = moreMenu(
        {
            canWrite,
            canMerge,
            canRemove,
            canLink: d.linkedCustomers !== undefined,
            canUnlink: !!d.siteAccount?.canUnlink,
            hasRecords: hasMoneyRecords(d),
        },
        {
            merge: () => mergeWith(null),
            link: () => setLinking(true),
            notThem: () => void askNotThem(),
            remove: () => setRemoving(true),
            removeDetails: () => setRemovingDetails(true),
        },
    );

    const dialogs = (
        <>
            {editing ? (
                <EditSheet
                    key={editing}
                    open
                    onOpenChange={(o) => (o ? null : setEditing(0))}
                    contact={d.contact}
                    signsInWith={d.siteAccount?.email ?? null}
                    onMerge={
                        canMerge
                            ? (holder) => mergeWith(clashTarget(holder))
                            : undefined
                    }
                />
            ) : null}
            {canRemove && removingDetails ? (
                <RemoveDetailsDialog
                    contactId={d.contact.id}
                    name={name}
                    open
                    onOpenChange={setRemovingDetails}
                    onRemoved={removedDetails}
                />
            ) : null}
            {merging ? (
                <MergeDialog
                    hereId={d.contact.id}
                    target={merging.target}
                    open
                    onOpenChange={(o) => (o ? null : setMerging(null))}
                />
            ) : null}
            {canWrite ? (
                <IdentityLinkDialog
                    contactId={d.contact.id}
                    suggestions={suggestions}
                    duplicates={duplicates}
                    onMerge={mergeDuplicate}
                    open={linking}
                    onOpenChange={setLinking}
                />
            ) : null}
            {notThem ? (
                <ConfirmDialog
                    open
                    onOpenChange={(o) => (o ? null : setNotThem(null))}
                    {...unlinkConfirm(name, notThem)}
                    confirmLabel="Separate them"
                    cancelLabel="Keep them together"
                    icon={Unlink}
                    onConfirm={() => void separate(notThem)}
                />
            ) : null}
            <ConfirmDialog
                open={removing}
                onOpenChange={setRemoving}
                title={`Delete ${name}?`}
                description={`Their notes, leads, subscriptions and class packs go with them, and future classes paid with those packs are cancelled. Orders, bookings and invoices stay on record under the name they gave, and a store customer with the same email is kept. This cannot be undone.`}
                confirmLabel="Delete record"
                cancelLabel="Keep them"
                onConfirm={() => void remove()}
            />
        </>
    );

    return {
        menu,
        edit: () => setEditing((n) => n + 1),
        link: () => setLinking(true),
        mergeDuplicate,
        dialogs,
    };
}
