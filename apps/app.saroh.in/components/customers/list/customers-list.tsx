"use client";

import {
    FigureLoading,
    PageLoading,
} from "@/components/shared/page/page-loading";
import { PendingRegion } from "@/components/shared/page/screen-pending";
import { Button } from "@saroh/ui/button";
import { IntentLink } from "@saroh/ui/intent-link";
import { rememberPageSize } from "@saroh/ui/page-sizes";
import { Upload } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback } from "react";

import { importCustomersHref, newCustomerHref } from "@/lib/customers/links";
import type { CustomersPage, ListQuery } from "@/lib/customers/list";
import {
    emptyTitle,
    headerCount,
    isNarrowed,
    listHref,
    pageText,
} from "@/lib/customers/list";

import { ListPaging } from "@/components/shared/lists/list-toolbar";
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
    tabs = null,
    banner = null,
    pending = false,
    may,
}: {
    /** What the viewer may ask, for the controls before the first page. */
    may?: (action: string) => boolean;
    /** The page asked for is on its way: the last rows stay, greyed. */
    pending?: boolean;
    query: ListQuery;
    /** Null until the first page is read: the frame, rows as skeletons. */
    page: CustomersPage | null;
    /** The business's open storefronts, for Add customer and Import. */
    stores: { id: string; name: string }[];
    /** How many contacts, for the first-run state; `null` if unknown. */
    contacts: number | null;
    /** `contact:write`: link a paying store customer from the review. */
    canLink: boolean;
    /** Customers · Requests (DEC-172), for whoever can act on requests. */
    tabs?: ReactNode;
    /** The one banner while removal requests are open (DEC-172). */
    banner?: ReactNode;
}) {
    // In place: the address is the list's key (no server render, DEC-259).
    const go = useCallback(
        (patch: Partial<ListQuery>) =>
            window.history.replaceState(null, "", listHref(query, patch)),
        [query],
    );

    const first = stores.at(0);
    const many = stores.length > 1;
    const here = stores.find((s) => s.id === query.store) ?? null;
    const target = here?.id ?? (many ? undefined : first?.id);
    const actions = (
        <>
            {first ? (
                <Button variant="outline" asChild>
                    <IntentLink href={importCustomersHref(target)}>
                        <Upload className="mr-1.5 size-4" />
                        Import
                    </IntentLink>
                </Button>
            ) : null}
            <Button asChild>
                <IntentLink href={newCustomerHref()}>New customer</IntentLink>
            </Button>
        </>
    );

    // The whole truth (DEC-275): those linked, and those who paid and wait.
    const said = page ? headerCount(page) : null;
    const heading = (
        <>
            <ListHeading
                count={
                    !page ? (
                        <FigureLoading />
                    ) : said ? (
                        <>
                            {said.customers}
                            {said.customers && said.waiting ? " · " : null}
                            {said.waiting && said.customers ? (
                                <Button
                                    type="button"
                                    variant="link"
                                    size="inline"
                                    data-ph-unmask=""
                                    onClick={() => go({ chip: "unlinked" })}
                                >
                                    {said.waiting}
                                </Button>
                            ) : (
                                said.waiting
                            )}
                        </>
                    ) : null
                }
                actions={actions}
            />
            {tabs ? <div className="mb-4">{tabs}</div> : null}
            {banner}
        </>
    );
    if (!page) {
        return (
            <div>
                {heading}
                <Filters
                    query={query}
                    page={null}
                    go={go}
                    may={may}
                    stores={stores}
                />
                <PageLoading
                    bare
                    width="full"
                    shape="rows"
                    label="Loading customers"
                />
            </div>
        );
    }

    // Nobody linked yet, but people have paid (DEC-275): their rows, under
    // the one card that offers to review them one by one. With some linked,
    // the header's count and the Not linked view say it instead.
    const notice =
        page.everyone === 0 ? (
            <UnlinkedNotice
                count={page.unlinkedPaying}
                store={query.store}
                canLink={canLink}
            />
        ) : null;

    // Nobody has paid, signs in or was added, and nothing narrows: the one
    // place "No customers yet" is true.
    if (
        page.everyone === 0 &&
        page.unlinkedPaying === 0 &&
        !isNarrowed(query)
    ) {
        return (
            <div>
                {heading}
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
                searching={pending}
                count={page.total > page.pageSize ? pageText(page) : null}
            />
            {notice}
            <PendingRegion pending={pending}>
                <Rows
                    page={page}
                    canLink={canLink}
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
            </PendingRegion>
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
