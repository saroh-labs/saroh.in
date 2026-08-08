import { EmptyState } from "@saroh/ui/empty-state";
import { Wordmark } from "@saroh/ui/wordmark";

import { SignOutButton } from "@/components/sign-out-button";

/**
 * Shown when the API refuses the caller. Deliberately says nothing about why —
 * whether a grant was revoked, never existed, or the allowlist is empty is not
 * something the control plane should confirm to someone standing outside it.
 *
 * The copy says "does not have access to this area" rather than naming platform
 * administrator access: this same screen renders both for a non-staff caller AND
 * for staff who lack one permission (e.g. an operator opening /audit without
 * `audit:read`), and telling the latter they are not an administrator is simply
 * wrong.
 */
export function NotAuthorized({ email }: { email: string }) {
    return (
        <main className="mx-auto grid min-h-screen max-w-md place-items-center p-8">
            <div className="w-full">
                <div className="mb-6 flex justify-center">
                    <Wordmark suffix="control" />
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
