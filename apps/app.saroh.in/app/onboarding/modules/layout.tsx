import { getServerSession } from "@saroh/auth/next";
import { headers } from "next/headers";

import { AppHeader } from "@/components/shared/app-header";
import { UsageRecording } from "@/components/shared/usage-recording";
import { resolveActiveOrganization } from "@/lib/organizations/service";

/**
 * The module picker keeps the slim header it has always had — it is reached
 * from Home by someone already inside, who needs their account menu — while
 * the business step before it draws the split and nothing else.
 *
 * It can be recorded like the shell (DEC-125, 10 Oct): this is where a new
 * business is first asked what it needs, before it has a customer, and how
 * that reads is what the recordings are for. The same rules hold: switched
 * on, the person shares, and the notice is shown first (`UsageRecording`).
 */
export default async function OnboardingModulesLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await getServerSession(await headers());
    if (!session) return <>{children}</>;
    // Never fatal: without a business there is nothing to record against,
    // and the page says so itself.
    const business = await resolveActiveOrganization().catch(() => null);

    return (
        // Saroh's own words from top to bottom, so a recording can read
        // them (`data-ph-unmask`); inputs stay masked, and the header marks
        // the person's name and email as theirs.
        <div className="flex min-h-screen flex-col" data-ph-unmask="">
            <AppHeader onboarding user={session.user} />
            {business ? (
                <UsageRecording
                    userId={session.user.id}
                    organizationId={business.id}
                />
            ) : null}
            {children}
        </div>
    );
}
