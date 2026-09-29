import { Button } from "@saroh/ui/button";
import { EmptyState, PermissionDeniedState } from "@saroh/ui/data-state";
import { Users } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { newStorefrontHref } from "@/lib/stores/links";

/**
 * The Customers list's heading, the design's: "Customers" and how many the
 * business has, with Add customer and Import beside it. The count is left
 * out when it isn't known — never shown as 0.
 */
export function ListHeading({
    count,
    actions,
}: {
    count: string | null;
    actions?: ReactNode;
}) {
    return (
        <div className="mb-3.5 flex flex-wrap items-center gap-x-2.5 gap-y-3">
            <div className="flex min-w-0 flex-wrap items-baseline gap-2.5">
                <h1 className="m-0 font-display text-[24px] font-semibold tracking-[-0.03em]">
                    Customers
                </h1>
                {count ? (
                    <span className="text-[13px] tabular-nums text-muted-foreground">
                        {count}
                    </span>
                ) : null}
            </div>
            {actions ? (
                <div className="ml-auto flex flex-wrap gap-2">{actions}</div>
            ) : null}
        </div>
    );
}

/**
 * A role without `contact:read`: the design's locked state, as a denial
 * that explains and says who can change it — never a hidden screen.
 */
export function ListLocked() {
    return (
        <>
            <ListHeading count={null} />
            <PermissionDeniedState
                title="Customers aren't part of your role"
                description="An owner can give you access in Team."
            />
        </>
    );
}

/**
 * A business with nobody who has paid or signs in yet. It says who counts
 * and where everyone else is, so a clinic that takes money at the desk
 * without invoices isn't told it has no customers beside hundreds of
 * patients: Contacts, with its count when there is one.
 */
export function ListFirstRun({
    contacts,
    hasStorefront,
}: {
    /** How many contacts; `null` when that couldn't be read. */
    contacts: number | null;
    hasStorefront: boolean;
}) {
    return (
        <EmptyState
            icon={<Users />}
            title="No customers yet"
            description="Customers are people who've paid, signed in on your website or been added here. Everyone else is in Contacts."
            action={
                <div className="flex flex-wrap justify-center gap-2">
                    <Button asChild variant="outline">
                        <Link href="/contacts">
                            {contacts && contacts > 0
                                ? `Open Contacts (${contacts.toLocaleString("en-GB")})`
                                : "Open Contacts"}
                        </Link>
                    </Button>
                    {hasStorefront ? null : (
                        <Button asChild>
                            <Link href={newStorefrontHref}>
                                Create a storefront
                            </Link>
                        </Button>
                    )}
                </div>
            }
        />
    );
}

/**
 * The line under the list: who is on it, so someone who ordered and hasn't
 * paid, or a lead, isn't taken to be lost. Someone added here with Add
 * customer is on it from the start (DEC-056).
 */
export function ListNote() {
    return (
        <p className="mt-2.5 text-pretty text-[12px] text-muted-foreground">
            Customers are people who&apos;ve paid, signed in on your website or
            been added here. Everyone else is in{" "}
            <Link
                href="/contacts"
                className="font-medium text-brand transition-colors hover:text-foreground active:text-muted-foreground"
            >
                Contacts
            </Link>
            .
        </p>
    );
}
