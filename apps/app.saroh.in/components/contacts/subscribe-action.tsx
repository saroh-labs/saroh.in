"use client";

import { Button } from "@saroh/ui/button";
import { useState } from "react";

import type { ContactOption } from "@/components/shared/contact-picker";
import { SubscribeDialog } from "@/components/subscriptions/subscribe-dialog";
import type { Plan } from "@/lib/subscriptions/service";

/**
 * "Subscribe" on the person page's Subscriptions tab (#869): the
 * Subscriptions screen's own dialog, with this person already chosen.
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
        <>
            <Button
                size="sm"
                variant="outline"
                className="coarse:h-11"
                onClick={() => setOpen(true)}
            >
                Subscribe
            </Button>
            <SubscribeDialog
                open={open}
                onOpenChange={setOpen}
                contacts={[contact]}
                plans={plans}
                initialContactId={contact.id}
            />
        </>
    );
}
