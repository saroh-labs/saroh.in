"use client";

import { Button } from "@saroh/ui/button";
import { useState } from "react";

import { FormSheet } from "@/components/shared/form-sheet";
import { CustomerForm } from "@/components/stores/customer-form";
import type { Customer } from "@/lib/customers/service";

/**
 * "Edit details" on a location's own customer record (one not linked to a
 * contact), as Customer Detail's Edit details is for a linked one: the page
 * shows the details as rows, and this button opens the form that changes
 * them in a side sheet.
 *
 * The sheet holds every field the record has, in the app's one sheet
 * frame (`FormSheet`). Nothing is saved until Save. A refusal keeps the
 * sheet open with what was typed. Cancel, Escape and the close button drop
 * the draft, a press outside does nothing once something is typed, and
 * each opening starts from what is saved. Closed, the keyboard goes back
 * to the button.
 */
export function EditStoreCustomer({
    storeId,
    storeName,
    customer,
}: {
    storeId: string;
    storeName: string;
    customer: Customer;
}) {
    const [open, setOpen] = useState(false);
    // A new form each time it opens: a draft that was dropped stays dropped.
    const [opening, setOpening] = useState(0);

    return (
        <FormSheet
            open={open}
            trigger={
                <Button type="button" variant="outline" size="sm">
                    Edit details
                </Button>
            }
            title="Edit details"
            description={`What ${storeName} keeps for them: their email, name, phone and where they are.`}
            onOpen={() => {
                setOpening((n) => n + 1);
                setOpen(true);
            }}
            onClose={() => setOpen(false)}
        >
            <CustomerForm
                key={opening}
                storeId={storeId}
                customer={customer}
                onSaved={() => setOpen(false)}
            />
        </FormSheet>
    );
}
