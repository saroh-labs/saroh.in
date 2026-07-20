import { Button } from "@saroh/ui/button";
import { PageHeader } from "@saroh/ui/page-header";
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
            <PageHeader
                title={
                    hasOrgs
                        ? "Create an organization"
                        : "Welcome — create your organization"
                }
                description="An organization is your workspace and billing boundary. You can belong to several and switch between them anytime."
                actions={
                    hasOrgs ? (
                        <Button asChild variant="ghost" size="sm">
                            <Link href="/">Back to dashboard</Link>
                        </Button>
                    ) : undefined
                }
            />
            <CreateOrganizationForm />
        </main>
    );
}
