"use client";

import { createContext, useContext } from "react";

import type { NewBookingPrefill } from "./setup";

/** Opens New booking from anywhere under its host (U8). */
export interface NewBookingLauncher {
    open: (prefill?: NewBookingPrefill) => void;
}

/**
 * Its own small module, so a screen that only opens New booking (the
 * List's "Book on this day") doesn't carry the flow with it.
 */
export const LauncherContext = createContext<NewBookingLauncher | null>(null);

/**
 * The way into New booking for anything under a host: the header's New
 * booking, the List's "Book on this day", Book their next visit. Null
 * outside one, so a screen drawn without it keeps its own way.
 */
export function useNewBookingLauncher(): NewBookingLauncher | null {
    return useContext(LauncherContext);
}
