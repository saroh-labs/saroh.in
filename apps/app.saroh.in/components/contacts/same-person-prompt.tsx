"use client";

import { useState } from "react";

import { DuplicateNotice } from "@/components/customers/detail/notices";
import type { MergeTarget } from "@/lib/customer-workspace/merge";
import { suggestedTarget } from "@/lib/customer-workspace/merge";
import type { DuplicateSuggestion } from "@/lib/customer-workspace/service";

import { MergeDialog } from "../customers/detail/merge-dialog";

/**
 * "This may be the same person" on a contact's page (DEC-097): another
 * contact in the business has the same email. Saroh never links or merges
 * them on its own (DEC-049, ADR-011); Merge opens the same merge Customer
 * Detail uses, which keeps both records' histories on the one kept.
 * The page passes only what this viewer may see (`shownDuplicates`).
 */
export function SamePersonPrompt({
    contactId,
    duplicates,
    canMerge,
}: {
    contactId: string;
    duplicates: DuplicateSuggestion[];
    /** `customer:merge`; without it the prompt says their role can't. */
    canMerge: boolean;
}) {
    const [target, setTarget] = useState<MergeTarget | null>(null);
    if (!duplicates.length) return null;
    return (
        <>
            <DuplicateNotice
                duplicates={duplicates}
                className=""
                onMerge={
                    canMerge
                        ? (dup) => setTarget(suggestedTarget(dup))
                        : undefined
                }
            />
            {target ? (
                <MergeDialog
                    hereId={contactId}
                    target={target}
                    open
                    onOpenChange={(o) => (o ? null : setTarget(null))}
                    survivorHref={(id) => `/contacts/${encodeURIComponent(id)}`}
                />
            ) : null}
        </>
    );
}
