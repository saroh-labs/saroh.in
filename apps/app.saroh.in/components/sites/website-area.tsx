"use client";

import type { ReactNode } from "react";
import { createContext, useContext } from "react";

/**
 * The Website area switch for client components (DEC-240): the api's
 * answer, read on the server (`lib/sites/website-area-switch.ts`) by the
 * shell and the editor layout and handed down here. Off outside a provider.
 */
const WebsiteAreaContext = createContext(false);

export function WebsiteAreaProvider({
    on,
    children,
}: {
    on: boolean;
    children: ReactNode;
}) {
    return (
        <WebsiteAreaContext.Provider value={on}>
            {children}
        </WebsiteAreaContext.Provider>
    );
}

/** Whether the Website area is on, as the api said for this request. */
export function useWebsiteArea(): boolean {
    return useContext(WebsiteAreaContext);
}
