import { unstable_rethrow } from "next/navigation";

import { getJson, orgBase } from "@/lib/api/http";

import type { CustomersPage, ListQuery, UnlinkedPage } from "./list";
import { apiSearch } from "./list";

/**
 * Reads for the Customers list (DEC-041, C4) from
 * `GET organizations/:org/customers` and `…/customers/unlinked` (C3).
 * Server-only: `lib/api/http.ts` forwards the session.
 */

/**
 * One page of the business's customers. A 403 reaches `forbidden()` and a
 * failure throws to the segment boundary — never an empty list.
 */
export async function getCustomersPage(
    query: ListQuery,
): Promise<CustomersPage | null> {
    const base = await orgBase();
    if (!base) return null;
    const search = apiSearch(query);
    return getJson<CustomersPage>(
        `${base}/customers${search ? `?${search}` : ""}`,
    );
}

/**
 * Paying store customers no contact holds yet, a page at a time, each with
 * the contact that holds their email — for the review sheet. `null` when it
 * couldn't be read; the sheet says so and offers Try again.
 */
export async function getUnlinkedCustomers(
    store: string | null,
    page: number,
): Promise<UnlinkedPage | null> {
    const base = await orgBase();
    if (!base) return null;
    const s = new URLSearchParams();
    if (store) s.set("store", store);
    if (page > 1) s.set("page", String(page));
    const search = s.toString();
    try {
        return await getJson<UnlinkedPage>(
            `${base}/customers/unlinked${search ? `?${search}` : ""}`,
        );
    } catch (error) {
        unstable_rethrow(error);
        return null;
    }
}
