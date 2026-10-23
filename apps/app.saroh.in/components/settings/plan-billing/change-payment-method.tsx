"use client";

import { TextLink } from "@saroh/ui/text-link";
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
        <TextLink
            onClick={() =>
                showInfo(
                    "Changing how you pay Saroh isn't switched on yet.",
                    "Until it is, nothing about how you pay changes.",
                )
            }
            className="text-[12px]"
        >
            Change
        </TextLink>
    );
}
