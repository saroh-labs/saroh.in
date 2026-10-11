"use client";

import { Button } from "@saroh/ui/button";
import { rememberPageSize } from "@saroh/ui/page-sizes";
import { Upload } from "lucide-react";
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
    pageText,
} from "@/lib/customers/list";

import { ListPaging } from "@/components/shared/list-toolbar";
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
                <Link href={newCustomerHref()}>New customer</Link>
            </Button>
        </>
    );

    const heading = (
        <ListHeading
            count={page.everyone > 0 ? customersText(page.everyone) : null}
            actions={actions}
        />
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
            <div>
                {heading}
                {notice}
                <ListFirstRun
                    contacts={contacts}
                    hasStorefront={stores.length > 0}
                />
            </div>
        );
    }

    return (
        <div>
            {heading}
            <Filters
                query={query}
                page={page}
                go={go}
                searching={navigating}
                count={page.total > page.pageSize ? pageText(page) : null}
            />
            {notice}
            <div aria-busy={navigating}>
                <Rows
                    page={page}
                    empty={
                        <NoMatch
                            title={emptyTitle(query)}
                            searched={Boolean(query.q)}
                            onClear={() =>
                                go({ q: "", chip: "all", store: null })
                            }
                        />
                    }
                />
            </div>
            <ListPaging
                label="Pages of customers"
                page={page.page}
                total={page.total}
                size={page.pageSize}
                to={(n) => ({ onClick: () => go({ page: n }) })}
                onSize={(size) => {
                    rememberPageSize("customers", size);
                    go({ size });
                }}
            />
            <ListNote />
        </div>
    );
}
