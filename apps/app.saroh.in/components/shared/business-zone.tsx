"use client";

import { createContext, useContext } from "react";

import { ViewerDate } from "@/components/shared/viewer-date";
import { DEFAULT_BUSINESS_ZONE } from "@/lib/format/business-zone";

/**
 * The active business's time zone (UX-008), given once by the app shell so
 * any client component can write a time the way the business keeps it.
 * Outside the shell it is India's, as every reader's fallback is.
 */
const BusinessZoneContext = createContext<string>(DEFAULT_BUSINESS_ZONE);

export function BusinessZoneProvider({
    zone,
    children,
}: {
    zone: string;
    children: React.ReactNode;
}) {
    return (
        <BusinessZoneContext.Provider value={zone}>
            {children}
        </BusinessZoneContext.Provider>
    );
}

/** The active business's IANA zone. */
export function useBusinessZone(): string {
    return useContext(BusinessZoneContext);
}

/**
 * A time in the business's zone: what an order, a site's versions or its
 * review say happened. Server and browser agree from the first paint, so it
 * never shows the server's UTC and never trips hydration.
 */
export function BusinessDate(
    props: Omit<React.ComponentProps<typeof ViewerDate>, "timeZone">,
) {
    return <ViewerDate {...props} timeZone={useBusinessZone()} />;
}
