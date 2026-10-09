import { NotFound } from "@saroh/ui/not-found";
import { PageContainer } from "@saroh/ui/page-container";
import { Wordmark } from "@saroh/ui/wordmark";

import { AdminShell } from "@/components/admin-shell";
import type { StaffIdentity } from "@/lib/control-plane";
import { getStaffIdentity } from "@/lib/control-plane";

/**
 * The console's 404: an unknown address, or a business, person or run the
 * API has no record of (`notFound()`). Staff see it inside the shell, so the
 * menu still shows what they can open (as `NotAuthorized` does, #840);
 * anyone else gets the bare page with the wordmark. Asking the API who this
 * is never stops the page: if it can't answer, the bare page is still a way
 * back to the console.
 */
export default async function NotFoundPage() {
    const staff = await getStaffIdentity().catch(
        (): StaffIdentity | null => null,
    );

    const page = (
        <NotFound
            mark={staff ? undefined : <Wordmark suffix="console" />}
            title="Page not found"
            description="Nothing in this console lives at this address. The link may be old or mistyped, or the record was removed."
            primary={{ href: "/", label: "Back to the console" }}
        />
    );

    if (staff) {
        return (
            <AdminShell staff={staff}>
                <PageContainer>{page}</PageContainer>
            </AdminShell>
        );
    }
    return (
        <main className="flex min-h-screen items-center justify-center bg-background">
            {page}
        </main>
    );
}
