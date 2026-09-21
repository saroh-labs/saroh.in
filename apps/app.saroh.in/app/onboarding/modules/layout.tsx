import { getServerSession } from "@saroh/auth/next";
import { headers } from "next/headers";

import { AppHeader } from "@/components/shared/app-header";

/**
 * The module picker keeps the slim header it has always had — it is reached
 * from Home by someone already inside, who needs their account menu — while
 * the business step before it draws the split and nothing else.
 */
export default async function OnboardingModulesLayout({
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
