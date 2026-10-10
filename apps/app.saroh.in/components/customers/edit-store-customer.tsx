"use client";

import { Button } from "@saroh/ui/button";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@saroh/ui/sheet";
import { useState } from "react";

import { CustomerForm } from "@/components/stores/customer-form";
import type { Customer } from "@/lib/customers/service";

/**
 * "Edit details" on a location's own customer record (one not linked to a
 * contact), as Customer Detail's Edit details is for a linked one: the page
 * shows the details as rows, and this button opens the form that changes
 * them in a side sheet.
 *
 * The sheet holds every field the record has. Nothing is saved until Save
 * changes; a refusal keeps the sheet open with what was typed; Cancel,
 * Escape and the close button drop the draft, and each opening starts from
 * what is saved. Closed, the keyboard goes back to the button.
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
        <Sheet
            open={open}
            onOpenChange={(o) => {
                if (o) setOpening((n) => n + 1);
                setOpen(o);
            }}
        >
            <SheetTrigger asChild>
                <Button type="button" variant="outline" size="sm">
                    Edit details
                </Button>
            </SheetTrigger>
            <SheetContent className="flex w-full flex-col sm:max-w-md">
                <SheetHeader>
                    <SheetTitle>Edit details</SheetTitle>
                    <SheetDescription>
                        What {storeName} keeps for them: their email, name,
                        phone and where they are.
                    </SheetDescription>
                </SheetHeader>
                {/* The padding keeps a focus ring at the edge from being
                    cut off where the fields scroll. */}
                <div className="-mx-1 mt-5 min-h-0 flex-1 overflow-y-auto px-1 pb-1">
                    <CustomerForm
                        key={opening}
                        storeId={storeId}
                        customer={customer}
                        onSaved={() => setOpen(false)}
                        onCancel={() => setOpen(false)}
                    />
                </div>
            </SheetContent>
        </Sheet>
    );
}
