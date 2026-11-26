"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useState } from "react";

import type { Organization } from "@/lib/organizations/service";
import { listen } from "@/lib/query/broadcast";
import { getBrowserQueryClient, setReadErrorHooks } from "@/lib/query/client";
import {
    dropLeftBusinesses,
    invalidateSettings,
    keepForUser,
} from "@/lib/query/invalidate";
import { ORGANIZATIONS_KEY } from "@/lib/query/keys";
import { OrgProvider } from "@/lib/query/org";
import { forgetRecents } from "@/lib/search/recents";

/**
 * React Query for the app shell (DEC-259), mounted once. Not keyed by the
 * business, and a switch keeps the cache: every key carries its business,
 * so the one left stays beside the new one for a switch back.
 *
 * It holds the business list the server already read for this render
 * (`['organizations']`), and hears the other tabs: a business switched
 * there draws this tab's page again under it; a setting saved there reads
 * this tab's settings again; a sign-out there clears it.
 *
 * It is told who is signed in (`userId`, from the server's session read):
 * a different person than the cache was filled for clears it all, so a
 * teammate on a shared device never sees the last person's answers.
 */
export function QueryProvider({
    orgId,
    userId,
    organizations,
    children,
}: {
    orgId: string;
    userId: string;
    organizations: Organization[];
    children: React.ReactNode;
}) {
    const router = useRouter();
    const [client] = useState(() => {
        const qc = getBrowserQueryClient();
        seed(qc, organizations);
        return qc;
    });

    // Before paint: the readers drawn under the last person's cache read
    // again, empty, under this one. Then this render's list is held.
    useLayoutEffect(() => {
        if (keepForUser(client, userId)) seed(client, organizations);
    }, [client, userId, organizations]);

    // A later server render's list replaces the held one only once a
    // writer has marked it stale, or after a clear.
    useEffect(() => seed(client, organizations), [client, organizations]);

    useEffect(() => {
        setReadErrorHooks({
            refresh: () => router.refresh(),
            signIn: () => window.location.reload(),
        });
        const stop = listen((kind) => {
            if (kind === "switch") {
                router.refresh();
                return;
            }
            // A setting changed in another tab: read ours again.
            if (kind === "settings") {
                void invalidateSettings(client);
                return;
            }
            // Signed out elsewhere: drop it all and reload so this tab's
            // page is gone too (the middleware then sends it to sign-in).
            client.clear();
            forgetRecents();
            window.location.reload();
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
    // A business no longer on it (removed or left elsewhere) isn't held.
    dropLeftBusinesses(client, organizations);
}
