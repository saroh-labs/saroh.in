"use client";

import { Button } from "@saroh/ui/button";
import { useState } from "react";

import type { ContactOption } from "@/components/shared/fields/contact-picker";
import { SubscribeDialog } from "@/components/subscriptions/list/subscribe-dialog";
import type { Plan } from "@/lib/subscriptions/service";
import { SubscriptionSaveProvider } from "@/lib/subscriptions/use-subscriptions";

/**
 * "Subscribe" on the person page's Subscriptions tab (#869): the
 * Subscriptions screen's own dialog, with this person already chosen. It
 * saves as the tab's business and reads the person's page again
 * (`SubscriptionSaveProvider`, DEC-259).
 */
export function SubscribeAction({
    contact,
    plans,
}: {
    contact: ContactOption;
    plans: Plan[];
}) {
    const [open, setOpen] = useState(false);
    return (
        <SubscriptionSaveProvider>
            <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
                Subscribe
            </Button>
            <SubscribeDialog
                open={open}
                onOpenChange={setOpen}
                contacts={[contact]}
                plans={plans}
                initialContactId={contact.id}
            />
        </SubscriptionSaveProvider>
    );
}
