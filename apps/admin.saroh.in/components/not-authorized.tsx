import { SignOutButton } from "@/components/sign-out-button";

/**
 * Shown when the API refuses the caller as non-staff. Deliberately says nothing
 * about why — whether a grant was revoked, never existed, or the allowlist is
 * empty is not something the control plane should confirm to someone standing
 * outside it.
 */
export function NotAuthorized({ email }: { email: string }) {
    return (
        <main className="mx-auto max-w-md p-8">
            <h1 className="text-xl font-semibold">Not authorized</h1>
            <p className="mt-2 text-sm text-muted-foreground">
                {email} does not have Saroh platform administrator access.
            </p>
            <div className="mt-4">
                <SignOutButton />
            </div>
        </main>
    );
}
