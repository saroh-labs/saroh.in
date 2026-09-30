"use client";

import type { ReactNode } from "react";
import { createContext, useContext } from "react";

/**
 * Whether the page is a test release (DEC-071, T6), for the blocks that
 * would otherwise take a real order, booking, payment or enquiry.
 *
 * The site's layout wraps a test host's pages in a provider; everywhere
 * else (the live site, the editor's canvas, the catalogue) there is none,
 * and `useTestRelease()` is null, so every flow behaves as it always has.
 */

export interface TestReleaseInfo {
    /** The release's name, as the bar shows it. */
    name: string;
}

const TestReleaseContext = createContext<TestReleaseInfo | null>(null);

export function TestReleaseProvider({
    release,
    children,
}: {
    release: TestReleaseInfo | null;
    children: ReactNode;
}) {
    return (
        <TestReleaseContext.Provider value={release}>
            {children}
        </TestReleaseContext.Provider>
    );
}

/** The release this page shows, or null on a live page. */
export function useTestRelease(): TestReleaseInfo | null {
    return useContext(TestReleaseContext);
}
