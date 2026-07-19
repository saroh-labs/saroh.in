import { Button } from "@saroh/ui/button";
import Link from "next/link";
import { redirect } from "next/navigation";

import { OrganizationSwitcher } from "@/components/organizations/organization-switcher";
import { SignOutButton } from "@/components/sign-out-button";
import { StoreCard } from "@/components/stores/store-card";
import { StoresEmptyState } from "@/components/stores/stores-empty-state";
import {
    listOrganizations,
    resolveActiveOrganization,
} from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";
import { listStores } from "@/lib/stores/service";

export default async function Home() {
    const session = await requireSession();

    // Zero-org funnel: a signed-in user with no organization onboards first.
    const organizations = await listOrganizations();
    if (organizations.length === 0) redirect("/onboarding");
    const activeOrg = await resolveActiveOrganization();

    const stores = await listStores();

    return (
        <main className="mx-auto max-w-4xl p-8">
            <div className="mb-8 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    {activeOrg && (
                        <OrganizationSwitcher
                            organizations={organizations}
                            activeOrgId={activeOrg.id}
                        />
                    )}
                    <span className="text-sm text-muted-foreground">
                        {session.user.email}
                    </span>
                </div>
                <div className="flex items-center gap-4">
                    <nav className="flex items-center gap-4 text-sm">
                        <Link
                            href="/contacts"
                            className="text-muted-foreground hover:text-foreground hover:underline"
                        >
                            Contacts
                        </Link>
                        <Link
                            href="/leads"
                            className="text-muted-foreground hover:text-foreground hover:underline"
                        >
                            Leads
                        </Link>
                        <Link
                            href="/pipeline"
                            className="text-muted-foreground hover:text-foreground hover:underline"
                        >
                            Pipeline
                        </Link>
                    </nav>
                    <SignOutButton />
                </div>
            </div>

            <div className="mb-6 flex items-center justify-between">
                <h1 className="text-2xl font-semibold">Your stores</h1>
                {stores.length > 0 && (
                    <Button asChild>
                        <Link href="/stores/new">New store</Link>
                    </Button>
                )}
            </div>

            {stores.length === 0 ? (
                <StoresEmptyState />
            ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                    {stores.map((store) => (
                        <StoreCard key={store.id} store={store} />
                    ))}
                </div>
            )}
        </main>
    );
}
