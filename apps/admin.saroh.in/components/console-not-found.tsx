import { NotFound } from "@saroh/ui/not-found";
import { PageContainer } from "@saroh/ui/page-container";
import { Wordmark } from "@saroh/ui/wordmark";

import { AdminShell } from "@/components/admin-shell";
import type { StaffIdentity } from "@/lib/control-plane";
import { getStaffIdentity } from "@/lib/control-plane";

/**
 * The console's 404: an unknown address, or a business, user, release or
 * search page the API has no record of (`notFound()`). A section's
 * `not-found.tsx` passes what wasn't found and the way back to its list;
 * the root's is the generic one. Staff see it inside the shell, so the
 * menu still shows what they can open (as `NotAuthorized` does, #840);
 * anyone else gets the bare page with the wordmark. Asking the API who this
 * is never stops the page: if it can't answer, the bare page is still a way
 * back to the console.
 */
export async function ConsoleNotFound({
    title,
    description,
    back,
}: {
    title: string;
    description: string;
    back: { href: string; label: string };
}) {
    const staff = await getStaffIdentity().catch(
        (): StaffIdentity | null => null,
    );

    const page = (
        <NotFound
            mark={staff ? undefined : <Wordmark suffix="console" />}
            title={title}
            description={description}
            primary={back}
            secondary={
                back.href === "/"
                    ? undefined
                    : { href: "/", label: "Back to the console" }
            }
        />
    );

    if (staff) {
        return (
            <AdminShell staff={staff}>
                <PageContainer width="full">{page}</PageContainer>
            </AdminShell>
        );
    }
    return (
        <main className="flex min-h-screen items-center justify-center bg-background">
            {page}
        </main>
    );
}
