"use client";

import type { ReactNode } from "react";
import { createContext, useContext } from "react";

import type { Trade } from "@/lib/organizations/trade";

/**
 * The open business's trade (DEC-216), given once by the app shell so a
 * template choice anywhere in it (the Turn on sheet) suggests the trade's
 * templates first. Null outside the shell, or for a business with none.
 */
const BusinessTradeContext = createContext<{
    trade: Trade | null;
    tradeOther: string | null;
    startTemplate: string | null;
    canSetTrade: boolean;
}>({ trade: null, tradeOther: null, startTemplate: null, canSetTrade: false });

export function BusinessTradeProvider({
    trade,
    tradeOther = null,
    startTemplate,
    canSetTrade = false,
    children,
}: {
    trade: Trade | null;
    /** The trade typed beside Other ("Bakery"), for the Suggested heading. */
    tradeOther?: string | null;
    /** The template picked in the gallery (`startTemplate`), to start on. */
    startTemplate: string | null;
    /** `org:update`: an untraded "Suggested" offers to set the trade. */
    canSetTrade?: boolean;
    children: ReactNode;
}) {
    return (
        <BusinessTradeContext.Provider
            value={{ trade, tradeOther, startTemplate, canSetTrade }}
        >
            {children}
        </BusinessTradeContext.Provider>
    );
}

export function useBusinessTrade(): Trade | null {
    return useContext(BusinessTradeContext).trade;
}

/** The trade typed beside Other ("Bakery"); null for any other trade. */
export function useBusinessTradeOther(): string | null {
    return useContext(BusinessTradeContext).tradeOther;
}

/** The template picked in the gallery, which a choice starts on; or null. */
export function useBusinessStartTemplate(): string | null {
    return useContext(BusinessTradeContext).startTemplate;
}

/** Whoever may set the business's trade (`org:update`). */
export function useCanSetTrade(): boolean {
    return useContext(BusinessTradeContext).canSetTrade;
}
