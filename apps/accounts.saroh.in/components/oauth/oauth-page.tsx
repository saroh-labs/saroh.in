import { resolveServerSession } from "@saroh/auth/next";
import { FailedState } from "@saroh/ui/data-state";
import { SplitShell } from "@saroh/ui/split-shell";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { OAUTH_WORDS, oauthQueryOf, signInFirst } from "@/lib/oauth-sign-in";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Both AI-app sign-in pages start alike: the signed query, and sign in first. */
export async function openOAuthPage(page: string, searchParams: SearchParams) {
    const oauthQuery = oauthQueryOf(await searchParams);
    const session = await resolveServerSession(await headers());
    if (session.status === "anonymous") redirect(signInFirst(page, oauthQuery));
    return { oauthQuery, reachable: session.status !== "unavailable" };
}

/** The AI-app sign-in pages' "couldn't reach Saroh" state, with a retry. */
export function OAuthUnreachable({ retryHref }: { retryHref: string }) {
    return (
        <SplitShell>
            <FailedState
                size="page"
                title={OAUTH_WORDS.unreachableTitle}
                description={OAUTH_WORDS.unreachableDescription}
                retryHref={retryHref}
            />
        </SplitShell>
    );
}
