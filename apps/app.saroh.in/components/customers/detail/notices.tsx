"use client";

import { Button } from "@saroh/ui/button";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { duplicateLine } from "@/lib/customer-workspace/merge";
import type { DuplicateSuggestion } from "@/lib/customer-workspace/service";

/**
 * A store customer with exactly this email that nobody has linked. Saroh
 * never joins them on its own (saroh-product: no claimed unification); a
 * person looks and links, and their orders then come in.
 */
export function PossibleMatch({
    matches,
    canLink,
    onLink,
}: {
    matches: {
        customerId: string;
        name: string;
        storefront: { name: string };
    }[];
    canLink: boolean;
    onLink: () => void;
}) {
    if (!matches.length) return null;
    const first = matches[0];
    const who =
        matches.length === 1
            ? `${first.name} at ${first.storefront.name} has the same email`
            : `${matches.length} store customers have the same email`;
    return (
        <div
            role="note"
            className="mb-4 flex flex-wrap items-center gap-2.5 rounded-[10px] border border-highlight bg-brand-subtle px-[13px] py-2.5"
        >
            <span className="flex-[1_1_240px] text-[13px] text-brand-subtle-foreground">
                <strong className="font-semibold">
                    Possible match — link?
                </strong>{" "}
                {who}. Their orders stay apart until someone links them.
            </span>
            {canLink ? (
                <Button
                    variant="outline"
                    onClick={onLink}
                    className="h-[30px] rounded-[8px] border-highlight px-[11px] text-[12.5px] font-semibold coarse:h-11"
                >
                    Review and link
                </Button>
            ) : (
                <span className="text-[12px] text-muted-foreground">
                    An owner or admin can link them.
                </span>
            )}
        </div>
    );
}

/**
 * Another record that looks like the same person (C2's suggestions, C10):
 * a quiet line with Merge for whoever may merge. Saroh suggests and never
 * merges on its own (DEC-042); there is no Dismiss this round.
 */
export function DuplicateNotice({
    duplicates,
    onMerge,
}: {
    duplicates: DuplicateSuggestion[];
    /** Absent for a role without `customer:merge`. */
    onMerge?: (duplicate: DuplicateSuggestion) => void;
}) {
    if (!duplicates.length) return null;
    return (
        <div className="mb-4 grid gap-1.5">
            {duplicates.slice(0, 3).map((dup) => (
                <div
                    key={dup.contactId}
                    role="note"
                    className="flex flex-wrap items-center gap-2.5 rounded-[10px] border border-border-strong bg-card px-[13px] py-2.5"
                >
                    <span className="flex-[1_1_240px] text-[13px] text-foreground/75">
                        <strong className="font-semibold text-foreground">
                            Looks like the same person:
                        </strong>{" "}
                        {duplicateLine(dup)}
                    </span>
                    {onMerge ? (
                        <Button
                            variant="outline"
                            onClick={() => onMerge(dup)}
                            className="h-[30px] rounded-[8px] px-[11px] text-[12.5px] font-semibold coarse:h-11"
                        >
                            Merge…
                        </Button>
                    ) : (
                        <span className="text-[12px] text-muted-foreground">
                            An owner or admin can merge them.
                        </span>
                    )}
                </div>
            ))}
        </div>
    );
}

/**
 * Some of what the page reads failed: say which, show the rest, and offer
 * the read again (saroh-product-states: an aggregate degrades per source).
 */
export function PartialNotice({
    first,
    missing,
}: {
    first: string;
    missing: string[];
}) {
    const router = useRouter();
    const [pending, start] = useTransition();
    if (!missing.length) return null;
    return (
        <div
            role="status"
            className="mb-4 flex flex-wrap items-center gap-2.5 rounded-[10px] border border-border-strong bg-muted px-[13px] py-2.5"
        >
            <span className="flex-[1_1_240px] text-[13px] text-foreground/75">
                <strong className="font-semibold text-foreground">
                    Some of {first}&apos;s record couldn&apos;t be read:
                </strong>{" "}
                {missing.join(", ")}. Everything else is below, and nothing has
                changed.
            </span>
            <Button
                variant="outline"
                disabled={pending}
                onClick={() => start(() => router.refresh())}
                className="h-[30px] rounded-[8px] px-[11px] text-[12.5px] font-semibold coarse:h-11"
            >
                {pending ? "Trying…" : "Try again"}
            </Button>
        </div>
    );
}
