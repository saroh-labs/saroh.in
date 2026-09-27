"use server";

import type { PeekAttention } from "@/lib/services/peek";

import type { UnlinkedPage } from "./list";
import { getUnlinkedCustomers } from "./list-service";
import type { CustomerSearch } from "./picker";
import {
    readCustomerAttention as readCustomerAttentionApi,
    searchCustomers,
} from "./search";
import type { CustomerInput, CustomerResult } from "./service";
import {
    createCustomer as createCustomerApi,
    deleteCustomer as deleteCustomerApi,
    updateCustomer as updateCustomerApi,
} from "./service";

/** Server Actions for customers — forward the cookie to api (write = owner/EDITOR+). */

export async function createCustomer(
    storeId: string,
    input: CustomerInput,
): Promise<CustomerResult> {
    return createCustomerApi(storeId, input);
}

export async function updateCustomer(
    storeId: string,
    customerId: string,
    input: CustomerInput,
): Promise<CustomerResult> {
    return updateCustomerApi(storeId, customerId, input);
}

export async function deleteCustomer(storeId: string, customerId: string) {
    return deleteCustomerApi(storeId, customerId);
}

/**
 * The customer picker's search (E4): by name or phone, most recent first.
 * `contact:read`; a caller without it is told so, not shown an empty list.
 */
export async function findCustomers(query: string): Promise<CustomerSearch> {
    return searchCustomers(query);
}

/** A picked customer's Needs attention, as far as the viewer may see (C1). */
export async function readCustomerAttention(
    contactId: string,
): Promise<PeekAttention | null> {
    return readCustomerAttentionApi(contactId);
}

/**
 * A page of the paying store customers no contact holds yet, for the
 * Customers list's review sheet (C4). `null` when it couldn't be read.
 */
export async function loadUnlinkedCustomers(
    store: string | null,
    page: number,
): Promise<UnlinkedPage | null> {
    return getUnlinkedCustomers(store, page);
}
