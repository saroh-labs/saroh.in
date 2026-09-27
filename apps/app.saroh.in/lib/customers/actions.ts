"use server";

import type { UnlinkedPage } from "./list";
import { getUnlinkedCustomers } from "./list-service";
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
 * A page of the paying store customers no contact holds yet, for the
 * Customers list's review sheet (C4). `null` when it couldn't be read.
 */
export async function loadUnlinkedCustomers(
    store: string | null,
    page: number,
): Promise<UnlinkedPage | null> {
    return getUnlinkedCustomers(store, page);
}
