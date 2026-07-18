import Link from "next/link";

import { CreateOrganizationForm } from "@/components/organizations/create-organization-form";
import { listOrganizations } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";

/**
 * Onboarding / create-organization. Doubles as the zero-org funnel target
 * (app/page.tsx redirects here when the user belongs to no organization) and
 * the "Create organization" destination from the switcher — so the back link
 * only appears when the user already has at least one org to return to.
 */
export default async function OnboardingPage() {
    await requireSession();
    const organizations = await listOrganizations();
    const hasOrgs = organizations.length > 0;

    return (
        <main className="mx-auto max-w-lg p-8">
            {hasOrgs && (
                <Link
                    href="/"
                    className="text-sm text-muted-foreground hover:underline"
                >
                    ← Back to dashboard
                </Link>
            )}
            <h1 className="mt-4 text-2xl font-semibold tracking-tight">
                {hasOrgs
                    ? "Create an organization"
                    : "Welcome — create your organization"}
            </h1>
            <p className="mb-8 mt-1 text-sm text-muted-foreground">
                An organization is your workspace and billing boundary. You can
                belong to several and switch between them anytime.
            </p>
            <CreateOrganizationForm />
        </main>
    );
}
