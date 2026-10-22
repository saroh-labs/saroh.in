"use client";

import { ListSearch } from "@saroh/ui/list-search";

/**
 * The Invoices list's search (DEC-173, U8 #1120): a name, part of an
 * invoice number, or an amount ("8400", "₹8,400"). Searched by the API
 * (`?q=`), so an invoice older than the newest page is found too. It is in
 * the address, so a reload or a shared link keeps it; "/" jumps to it at a
 * desk. The one list search (`ListSearch`): one width, Escape clears it,
 * and it says "Searching…" while the list is read.
 */
export function InvoiceSearch({
    term,
    searching,
    onSearch,
}: {
    /** What the list is showing now, from the address. */
    term: string;
    searching: boolean;
    onSearch: (term: string) => void;
}) {
    return (
        <ListSearch
            placeholder="Search invoices"
            describe="By name, invoice number or amount"
            defaultValue={term}
            searching={searching}
            onSearch={onSearch}
        />
    );
}
