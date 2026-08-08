"use server";

import type { CustomerInput, CustomerResult } from "./service";
import {
    createCustomer as createCustomerApi,
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
