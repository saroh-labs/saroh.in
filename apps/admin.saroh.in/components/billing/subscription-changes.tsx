"use client";

import type { ReactNode } from "react";
import { createContext, useContext } from "react";

import type { ChangeFeedback } from "@/lib/use-change-feedback";
import { useChangeFeedback } from "@/lib/use-change-feedback";

interface SubscriptionChanges {
    report: (feedback: ChangeFeedback) => void;
    isHighlighted: (rowId: string) => boolean;
}

const Changes = createContext<SubscriptionChanges | null>(null);

/**
 * The Subscriptions screen's one feedback (R9, U8): the sheet reports a
 * write, and the list's row for it lights for two seconds under the
 * sheet. Both sit inside this on the page, which a server component draws.
 */
export function SubscriptionChangesProvider({
    children,
}: {
    children: ReactNode;
}) {
    const { report, isHighlighted } = useChangeFeedback();
    return (
        <Changes.Provider value={{ report, isHighlighted }}>
            {children}
        </Changes.Provider>
    );
}

/** The screen's feedback; nothing, outside the provider (a lone test). */
export function useSubscriptionChanges(): SubscriptionChanges | null {
    return useContext(Changes);
}
