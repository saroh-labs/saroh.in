"use client";

import { createContext, useContext } from "react";

const OrgContext = createContext<string | null>(null);

/** The open business, from the server layout, for query keys (DEC-259). */
export function OrgProvider({
    orgId,
    children,
}: {
    orgId: string;
    children: React.ReactNode;
}) {
    return <OrgContext.Provider value={orgId}>{children}</OrgContext.Provider>;
}

/** The open business's id. Throws outside the shell: a key needs it. */
export function useOrgId(): string {
    const orgId = useContext(OrgContext);
    if (!orgId) throw new Error("useOrgId() is used outside OrgProvider");
    return orgId;
}

/** The open business's id, or null outside the shell, for a hook that also runs without it. */
export function useOrgIdOrNull(): string | null {
    return useContext(OrgContext);
}
