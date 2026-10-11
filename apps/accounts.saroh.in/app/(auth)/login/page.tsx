import { SplitPanel, SplitShell } from "@saroh/ui/split-shell";
import type { Metadata } from "next";

import { LoginForm } from "@/components/auth/login-form";
import { LOGIN_PANEL } from "@/components/auth/panel-copy";
import { safeDestination } from "@/lib/return-to";
import { signInProviders } from "@/lib/sign-in-options";

const TITLE = "Sign in to Saroh";
const DESCRIPTION = "Sign in to open this page in Saroh.";
/** `public/og-sign-in.png`: the marketing site's share card, saying this. */
const CARD = { url: "/og-sign-in.png", width: 1200, height: 630, alt: TITLE };

/**
 * What a pasted link to any signed-in page previews (12 Oct 2026).
 *
 * A chat app's preview is whatever an anonymous fetch sees, and for every
 * page of the workspace and the console that is this page, by way of the
 * redirect to sign-in. So this is the one share card of the signed-in apps:
 * it says where the link leads and nothing about what is behind it.
 *
 * Static on purpose. `og:url` and the canonical are `/login` with no query,
 * so the address being opened (`?redirect=…`, which can name a record) is
 * never written into the page, and no two links preview differently.
 */
export const metadata: Metadata = {
    title: { absolute: TITLE },
    description: DESCRIPTION,
    alternates: { canonical: "/login" },
    openGraph: {
        type: "website",
        siteName: "Saroh",
        title: TITLE,
        description: DESCRIPTION,
        url: "/login",
        images: [CARD],
    },
    twitter: {
        card: "summary_large_image",
        title: TITLE,
        description: DESCRIPTION,
        images: [CARD],
    },
};

/**
 * A server component so the `?redirect=` check runs on the server (#222).
 *
 * `isTrustedOrigin` reads `BETTER_AUTH_TRUSTED_ORIGINS`, which the browser
 * never sees — validating in the client component would silently fall back to
 * the production list and reject every development origin. The form receives
 * a destination that has already been vetted, so it cannot follow an
 * unvetted one.
 */
export default async function LoginPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const { redirect, email, with: way } = await searchParams;
    const providers = await signInProviders();
    return (
        <SplitShell panel={<SplitPanel {...LOGIN_PANEL} />}>
            <LoginForm
                returnTo={safeDestination(redirect)}
                invitedEmail={typeof email === "string" ? email : undefined}
                providers={providers}
                // A code is the main way. `?with=password` opens the
                // password form, for a link that knows it is wanted.
                way={way === "password" ? "password" : "code"}
            />
        </SplitShell>
    );
}
