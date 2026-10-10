import { formatNumber } from "@/lib/format/money";
import { Button } from "@saroh/ui/button";
import { EmptyState, PermissionDeniedState } from "@saroh/ui/data-state";
import { PageHeader } from "@saroh/ui/page-header";
import { Users } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { whoCanChange } from "@/components/shared/who-can-change";
import { newStorefrontHref } from "@/lib/stores/links";
import { TextLink } from "@saroh/ui/text-link";

/**
 * The Customers list's header: the page header every screen draws, with how
 * many the business has beside the title, and Import and New customer. The
 * count is left out when it isn't known or is none — never shown as 0.
 */
export function ListHeading({
    count,
    actions,
}: {
    count: string | null;
    actions?: ReactNode;
}) {
    return (
        <PageHeader
            className="mb-3.5"
            breadcrumb={["Sell", "Customers"]}
            title="Customers"
            count={count ?? undefined}
            actions={actions}
        />
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
            <PermissionDeniedState {...whoCanChange({ thing: "Customers" })} />
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
            description="People who've paid, signed in on your website or been added here show up as customers."
            action={
                <div className="flex flex-wrap justify-center gap-2">
                    <Button asChild variant="outline">
                        <Link href="/contacts">
                            {contacts && contacts > 0
                                ? `Open Contacts (${formatNumber(contacts)})`
                                : "Open Contacts"}
                        </Link>
                    </Button>
                    {hasStorefront ? null : (
                        <Button asChild>
                            <Link href={newStorefrontHref}>New location</Link>
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
            <TextLink href="/contacts">Contacts</TextLink>.
        </p>
    );
}
