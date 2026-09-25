"use client";

import { showInfo } from "@saroh/ui/toast";

/**
 * "Change", after how the business pays Saroh ("Saroh Settings" design).
 *
 * Nothing in the API changes how a business pays Saroh yet — the provider's
 * subscription is set up once, at checkout — so the link says that when
 * pressed rather than opening a flow that cannot finish. Filling it in is a
 * change here and nothing on the card.
 */
export function ChangePaymentMethod() {
    return (
        <button
            type="button"
            onClick={() =>
                showInfo(
                    "Changing how you pay Saroh isn't switched on yet",
                    "Until it is, nothing about how you pay changes.",
                )
            }
            className="rounded-sm text-[12px] font-semibold text-brand hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
            Change
        </button>
    );
}
