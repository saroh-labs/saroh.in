"use client";

import { Button } from "@saroh/ui/button";
import { Plus, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useTransition } from "react";

import { importCustomersHref, newCustomerHref } from "@/lib/customers/links";
import type { CustomersPage, ListQuery } from "@/lib/customers/list";
import {
    customersText,
    emptyTitle,
    isNarrowed,
    listHref,
    pageCount,
    pageText,
} from "@/lib/customers/list";

import { Filters } from "./filters";
import { NoMatch, Rows } from "./rows";
import { ListFirstRun, ListHeading, ListNote } from "./states";
import { UnlinkedNotice } from "./unlinked-sheet";

/**
 * Sell → Customers (DEC-041, round 2 C4; Saroh Customers.dc.html): one
 * list for the whole business, keyed on the contact — everyone who has
 * paid or signs in on its website — read a page at a time from the API
 * with search, chips and their counts, the sort, "Bought at" and pages of
 * 50. A row opens Customer Detail.
 *
 * Add customer and Import stay (default 21). Add customer makes a contact
 * for the whole business (DEC-056), so it asks no storefront. Import is
 * still brought in at one: with several storefronts and none picked it
 * leads to a page that asks which — never quietly to the first.
 */
export function CustomersList({
    query,
    page,
    stores,
    contacts,
    canLink,
}: {
    query: ListQuery;
    page: CustomersPage;
    /** The business's open storefronts, for Add customer and Import. */
    stores: { id: string; name: string }[];
    /** How many contacts, for the first-run state; `null` if unknown. */
    contacts: number | null;
    /** `contact:write`: link a paying store customer from the review. */
    canLink: boolean;
}) {
    const router = useRouter();
    const [navigating, startNavigation] = useTransition();
    const go = useCallback(
        (patch: Partial<ListQuery>) =>
            startNavigation(() =>
                router.replace(listHref(query, patch), { scroll: false }),
            ),
        [query, router],
    );

    const first = stores.at(0);
    const many = stores.length > 1;
    const here = stores.find((s) => s.id === query.store) ?? null;
    const target = here?.id ?? (many ? undefined : first?.id);
    const actions = (
        <>
            {first ? (
                <Button variant="outline" asChild>
                    <Link href={importCustomersHref(target)}>
                        <Upload className="mr-1.5 size-4" />
                        Import
                    </Link>
                </Button>
            ) : null}
            <Button asChild>
                <Link href={newCustomerHref()}>
                    <Plus className="mr-1.5 size-4" />
                    Add customer
                </Link>
            </Button>
        </>
    );

    const heading = (
        <ListHeading count={customersText(page.everyone)} actions={actions} />
    );
    const notice = (
        <UnlinkedNotice
            count={page.unlinkedPaying}
            store={query.store}
            canLink={canLink}
        />
    );

    // Nobody at all, and nothing narrowing: the one place "No customers
    // yet" is true. Unlinked paying customers still get their notice.
    if (page.everyone === 0 && !isNarrowed(query)) {
        return (
            <div className="max-w-[1100px]">
                {heading}
                {notice}
                <ListFirstRun
                    contacts={contacts}
                    hasStorefront={stores.length > 0}
                />
            </div>
        );
    }

    const pages = pageCount(page);
    return (
        <div className="max-w-[1100px]">
            {heading}
            <Filters query={query} page={page} go={go} />
            {notice}
            <div aria-busy={navigating}>
                <Rows
                    page={page}
                    empty={
                        <NoMatch
                            title={emptyTitle(query)}
                            onClear={() =>
                                go({ q: "", chip: "all", store: null })
                            }
                        />
                    }
                />
            </div>
            {page.total > page.pageSize ? (
                <nav
                    aria-label="Pages"
                    className="mt-3 flex items-center gap-2 text-[12.5px] text-muted-foreground"
                >
                    <span className="flex-1 tabular-nums">
                        {pageText(page)}
                    </span>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={page.page <= 1}
                        onClick={() => go({ page: page.page - 1 })}
                        className="h-[30px] rounded-[8px] px-3 text-[12.5px]"
                    >
                        Previous
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={page.page >= pages}
                        onClick={() => go({ page: page.page + 1 })}
                        className="h-[30px] rounded-[8px] px-3 text-[12.5px]"
                    >
                        Next
                    </Button>
                </nav>
            ) : null}
            <ListNote />
        </div>
    );
}
