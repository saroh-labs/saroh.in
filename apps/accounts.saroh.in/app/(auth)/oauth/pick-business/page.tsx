import { Button } from "@saroh/ui/button";
import { SplitShell } from "@saroh/ui/split-shell";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AuthHeading } from "@/components/auth/field";
import { OAuthUnreachable, openOAuthPage } from "@/components/oauth/oauth-page";
import { PickBusinessForm } from "@/components/oauth/oauth-steps";
import { apiFetch } from "@/lib/api";
import { getAppUrl } from "@/lib/app-urls";
import type { ConsentDetails, PickableBusiness } from "@/lib/oauth-sign-in";
import { OAUTH_WORDS, appName } from "@/lib/oauth-sign-in";

// The address carries a signed sign-in request: never sent on as a referrer.
export const metadata: Metadata = {
    title: "Connect an app",
    referrer: "no-referrer",
};

const PAGE = "/oauth/pick-business";

/**
 * An AI app's sign-in, step one (U9): Better Auth sends the person here
 * first (its login and post-login page). Signed out, they sign in and come
 * back. Then they pick which business the app works with: only this
 * edition's, never a demo. 404 while the AI apps switch (`API_MCP`) is off.
 */
export default async function PickBusinessPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const { oauthQuery, reachable } = await openOAuthPage(PAGE, searchParams);

    const [list, about] = !reachable
        ? [null, null]
        : await Promise.all([
              apiFetch("/oauth/businesses").catch(() => null),
              apiFetch(
                  `/oauth/consent?oauthQuery=${encodeURIComponent(oauthQuery)}`,
              ).catch(() => null),
          ]);
    if (list?.status === 404) notFound();
    if (!list?.ok) {
        return <OAuthUnreachable retryHref={`${PAGE}?${oauthQuery}`} />;
    }
    const businesses = (await list.json()) as PickableBusiness[];
    const details = about?.ok ? ((await about.json()) as ConsentDetails) : null;
    const app = details ? appName(details) : "This app";

    if (businesses.length === 0) {
        return (
            <SplitShell>
                <AuthHeading
                    title={OAUTH_WORDS.noBusinessTitle}
                    blurb={OAUTH_WORDS.noBusinessDescription}
                />
                <Button
                    asChild
                    className="sa-cta h-10 w-full rounded-[9px] text-[13.5px] font-semibold"
                >
                    <a href={getAppUrl()}>Set up a business</a>
                </Button>
            </SplitShell>
        );
    }

    return (
        <SplitShell>
            <AuthHeading
                title={OAUTH_WORDS.pickTitle(app)}
                blurb={OAUTH_WORDS.pickDescription}
            />
            <PickBusinessForm businesses={businesses} oauthQuery={oauthQuery} />
        </SplitShell>
    );
}
