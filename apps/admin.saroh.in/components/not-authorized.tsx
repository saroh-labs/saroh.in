import { buttonVariants } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/empty-state";
import { PageContainer } from "@saroh/ui/page-container";
import { Wordmark } from "@saroh/ui/wordmark";
import Link from "next/link";

import { AdminShell } from "@/components/admin-shell";
import { SignOutButton } from "@/components/sign-out-button";
import type { StaffIdentity } from "@/lib/control-plane";

/**
 * Shown when the API refuses the caller. Deliberately says nothing about why —
 * whether a grant was revoked, never existed, or the allowlist is empty is not
 * something the control plane should confirm to someone standing outside it.
 *
 * Two shapes (owner decision, 6 Oct, #840):
 *
 * - **Staff without this screen's permission** (`staff` given) get the refusal
 *   inside the console shell, so the menu shows the screens they *can* open
 *   and they are never stranded on a page whose only way out is Sign out.
 * - **Not staff at all** (no grant, not on the allowlist) keep the bare page:
 *   there is no menu to show them.
 *
 * The copy says "does not have access to this area" rather than naming platform
 * administrator access, because staff who lack one permission are still
 * administrators.
 */
export function NotAuthorized({
    email,
    staff,
}: {
    email: string;
    staff?: StaffIdentity | null;
}) {
    if (staff) {
        return (
            <AdminShell staff={staff}>
                <PageContainer>
                    <NoAccessPanel email={staff.email} />
                </PageContainer>
            </AdminShell>
        );
    }

    return (
        <main className="mx-auto grid min-h-screen max-w-md place-items-center p-8">
            <div className="w-full">
                <div className="mb-6 flex justify-center">
                    <Wordmark suffix="console" />
                </div>
                <EmptyState
                    title="Not authorized"
                    description={`${email} does not have access to this area.`}
                    action={<SignOutButton />}
                />
            </div>
        </main>
    );
}

/**
 * The refusal as a work-area panel, for a screen already inside the shell —
 * one whose read was refused after the gate let it in (access changed
 * mid-visit). Sign out is in the header, so the way out here is the overview,
 * which every staff member may open.
 */
export function NoAccessPanel({ email }: { email: string }) {
    return (
        <EmptyState
            title="Not authorized"
            description={`${email} does not have access to this area. The menu shows the screens you can open.`}
            action={
                <Link
                    href="/"
                    className={buttonVariants({
                        variant: "outline",
                        size: "sm",
                    })}
                >
                    Go to the overview
                </Link>
            }
        />
    );
}
