"use client";

import { Button } from "@saroh/ui/button";
import { showError } from "@saroh/ui/toast";
import { useTransition } from "react";

import { markContactMessageAction } from "@/lib/contact-message-actions";

/**
 * Mark handled / Open again on one message. A toggle, not a dialog: it
 * changes nothing anyone outside the team sees and goes straight back.
 * The API records who did it.
 */
export function HandledToggle({
    id,
    handled,
}: {
    id: string;
    handled: boolean;
}) {
    const [pending, start] = useTransition();
    return (
        <Button
            type="button"
            size="sm"
            variant={handled ? "ghost" : "outline"}
            disabled={pending}
            onClick={() =>
                start(async () => {
                    const result = await markContactMessageAction({
                        id,
                        handled: !handled,
                    });
                    if (!result.ok)
                        showError("Couldn't change the message", result.error);
                })
            }
        >
            {pending ? "Saving…" : handled ? "Open again" : "Mark handled"}
        </Button>
    );
}
