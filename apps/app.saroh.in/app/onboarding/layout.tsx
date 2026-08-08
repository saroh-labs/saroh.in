import { getServerSession } from "@saroh/auth/next";
import { headers } from "next/headers";

import { AppHeader } from "@/components/shared/app-header";

/**
 * First-run chrome: a slim top bar and nothing else.
 *
 * These routes deliberately sit outside `(shell)`. Onboarding asks the merchant
 * what their business needs to do; rendering the full sidebar alongside that
 * question both answers it prematurely and shows fifteen destinations for
 * capabilities they have not turned on. The zero-org step already worked this
 * way — now the whole funnel does, org or not.
 *
 * Non-throwing, like `AppShell`: middleware owns the auth gate, so with no
 * session we render the page bare rather than redirecting from a layout.
 */
export default async function OnboardingLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await getServerSession(await headers());
    if (!session) return <>{children}</>;

    return (
        <div className="flex min-h-screen flex-col">
            <AppHeader onboarding user={session.user} />
            {children}
        </div>
    );
}
