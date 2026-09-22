"use client";

import { DeleteMenu } from "@/components/shared/delete-menu";
import { deleteCustomer } from "@/lib/customers/actions";

/**
 * Delete a shop customer who never ordered — a record added by hand or by
 * import that turned out to be wrong. One who has ordered stays, because an
 * order keeps who bought it; the menu says so rather than hiding the option.
 */
export function DeleteCustomerMenu({
    storeId,
    customerId,
    name,
    storeName,
    orderCount,
}: {
    storeId: string;
    customerId: string;
    name: string;
    storeName: string;
    /** `null` when their orders could not be read; the API still decides. */
    orderCount: number | null;
}) {
    return (
        <DeleteMenu
            name={name}
            verb="Delete customer"
            title={`Delete ${name}?`}
            description={`They are removed from ${storeName}'s customers. The same person in your contacts is kept. This cannot be undone.`}
            onDelete={() => deleteCustomer(storeId, customerId)}
            done={() => `${name} deleted`}
            then="/commerce/customers"
            unavailable={
                orderCount
                    ? `They have ${orderCount === 1 ? "an order" : `${orderCount} orders`}, and an order keeps who bought it.`
                    : undefined
            }
        />
    );
}
