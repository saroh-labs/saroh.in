import { SplitShell } from "@saroh/ui/split-shell";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AuthHeading } from "@/components/auth/field";
import { OAuthUnreachable, openOAuthPage } from "@/components/oauth/oauth-page";
import { ConsentButtons } from "@/components/oauth/oauth-steps";
import { apiFetch } from "@/lib/api";
import type { ConsentDetails } from "@/lib/oauth-sign-in";
import { OAUTH_WORDS, appName } from "@/lib/oauth-sign-in";

export const metadata: Metadata = {
    title: "Allow an app",
    referrer: "no-referrer",
};

const PAGE = "/oauth/consent";

/**
 * An AI app's sign-in, last step (U9): the app, whether Saroh knows it, every
 * business ticked, what it may do, where the person goes back to, and that what it
 * reads goes to the app's provider. An app wearing Saroh's, Claude's,
 * ChatGPT's or OpenAI's name without being theirs gets no Allow. 404 while
 * the AI apps switch (`API_MCP`) is off.
 */
export default async function ConsentPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const { oauthQuery, reachable } = await openOAuthPage(PAGE, searchParams);

    const res = !reachable
        ? null
        : await apiFetch(
              `/oauth/consent?oauthQuery=${encodeURIComponent(oauthQuery)}`,
          ).catch(() => null);
    if (res?.status === 404) notFound();
    if (!res?.ok) {
        return <OAuthUnreachable retryHref={`${PAGE}?${oauthQuery}`} />;
    }
    const details = (await res.json()) as ConsentDetails;
    const app = appName(details);

    if (details.refused) {
        return (
            <SplitShell>
                <AuthHeading
                    title={OAUTH_WORDS.refusedTitle}
                    blurb={OAUTH_WORDS.refusedDescription}
                />
            </SplitShell>
        );
    }
    if (details.businesses.length === 0) {
        return (
            <SplitShell>
                <AuthHeading
                    title={OAUTH_WORDS.noPickTitle}
                    blurb={OAUTH_WORDS.noPickDescription}
                />
            </SplitShell>
        );
    }

    return (
        <SplitShell>
            {details.app.known ? null : (
                <p className="sa-rise mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-amber-700 dark:text-amber-400">
                    {OAUTH_WORDS.unverified}
                </p>
            )}
            <AuthHeading
                title={OAUTH_WORDS.consentTitle(
                    app,
                    details.businesses.map((b) => b.name),
                )}
                blurb={
                    details.app.known ? undefined : OAUTH_WORDS.unverifiedNote
                }
            />
            {details.businesses.length > 1 ? (
                <ul className="sa-rise mt-3 flex flex-col gap-1 text-[13px] font-semibold">
                    {details.businesses.map((b) => (
                        <li key={b.id}>{b.name}</li>
                    ))}
                </ul>
            ) : null}
            <div className="sa-rise bg-muted mb-4 mt-4 rounded-[9px] px-[13px] py-[11px]">
                <p className="text-[12.5px] font-semibold">
                    {OAUTH_WORDS.canHeading}
                </p>
                <ul className="dark:text-muted-foreground mt-1 list-disc text-pretty pl-5 text-[12.5px] leading-[1.5] text-neutral-600">
                    {details.can.map((line) => (
                        <li key={line}>{line}</li>
                    ))}
                </ul>
                <p className="dark:text-muted-foreground mt-2 text-pretty text-[12px] leading-[1.5] text-neutral-600">
                    {OAUTH_WORDS.roleNote}
                </p>
            </div>
            <p className="sa-rise dark:text-muted-foreground mb-[18px] text-pretty text-[12.5px] leading-[1.5] text-neutral-600">
                {OAUTH_WORDS.dataLine(app)}{" "}
                {details.redirectHost
                    ? OAUTH_WORDS.returnsTo(details.redirectHost)
                    : null}{" "}
                {OAUTH_WORDS.disconnect}
            </p>
            <ConsentButtons oauthQuery={oauthQuery} />
        </SplitShell>
    );
}
