"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import type { Organization } from "@/lib/organizations/service";
import { listen } from "@/lib/query/broadcast";
import { getBrowserQueryClient, setReadErrorHooks } from "@/lib/query/client";
import { ORGANIZATIONS_KEY } from "@/lib/query/keys";
import { OrgProvider } from "@/lib/query/org";

/**
 * React Query for the app shell (DEC-259), mounted once. Not keyed by the
 * business: a switch clears the cache instead of remounting the shell.
 *
 * It holds the business list the server already read for this render
 * (`['organizations']`), and hears the other tabs: a business switched
 * there clears this tab's cache and draws the page again under it; a
 * sign-out there clears it.
 */
export function QueryProvider({
    orgId,
    organizations,
    children,
}: {
    orgId: string;
    organizations: Organization[];
    children: React.ReactNode;
}) {
    const router = useRouter();
    const [client] = useState(() => {
        const qc = getBrowserQueryClient();
        seed(qc, organizations);
        return qc;
    });

    // A later server render's list replaces the held one only once a
    // writer has marked it stale, or after a clear.
    useEffect(() => seed(client, organizations), [client, organizations]);

    useEffect(() => {
        setReadErrorHooks({
            refresh: () => router.refresh(),
            signIn: () => window.location.reload(),
        });
        const stop = listen((kind) => {
            client.clear();
            // Signed out elsewhere: reload so this tab's page is gone too
            // (the middleware then sends it to sign-in).
            if (kind === "signout") window.location.reload();
            else router.refresh();
        });
        return () => {
            stop();
            setReadErrorHooks(null);
        };
    }, [client, router]);

    return (
        <QueryClientProvider client={client}>
            <OrgProvider orgId={orgId}>{children}</OrgProvider>
        </QueryClientProvider>
    );
}

function seed(
    client: ReturnType<typeof getBrowserQueryClient>,
    organizations: Organization[],
): void {
    const state = client.getQueryState(ORGANIZATIONS_KEY);
    if (state?.data !== undefined && !state.isInvalidated) return;
    client.setQueryData(ORGANIZATIONS_KEY, organizations);
}
