"use client";

import { ChangeEmailForm } from "@/components/account/change-email-form";
import { ChangePasswordForm } from "@/components/account/change-password-form";
import { DeleteAccount } from "@/components/account/delete-account";
import { ProfileForm } from "@/components/account/profile-form";
import { SessionsList } from "@/components/account/sessions-list";
import { authClient } from "@/lib/auth.client";
import { Button } from "@saroh/ui/button";
import { Wordmark } from "@saroh/ui/wordmark";
import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * Account settings — the user's own identity, owned by accounts.saroh.in
 * because this app is the single identity provider. The product apps
 * (app.saroh.in, admin) deliberately do NOT duplicate any of this; they link
 * here from their header user menu.
 *
 * Everything here acts on the SESSION USER only, never on an id from the URL,
 * so there is no surface on which to act as someone else.
 */
export default function AccountPage() {
    const router = useRouter();
    const { data: session, isPending, error } = authClient.useSession();

    if (isPending) {
        return (
            <main className="mx-auto max-w-2xl p-8">
                <p className="text-muted-foreground text-sm">Loading…</p>
            </main>
        );
    }

    if (error) {
        return (
            <main className="mx-auto max-w-2xl p-8">
                <p className="text-destructive text-sm">{error.message}</p>
            </main>
        );
    }

    if (!session?.user) {
        return (
            <main className="mx-auto grid max-w-2xl gap-4 p-8">
                <h1 className="text-2xl font-semibold">Account</h1>
                <p className="text-muted-foreground text-sm">
                    Sign in to manage your account.
                </p>
                <Link href="/login" className="text-sm underline">
                    Go to login
                </Link>
            </main>
        );
    }

    const { user } = session;

    return (
        <main className="mx-auto grid max-w-2xl gap-6 p-6 sm:p-8">
            <header className="flex items-center justify-between gap-4">
                <div className="grid gap-1">
                    <Link href="/apps" aria-label="Saroh">
                        <Wordmark />
                    </Link>
                    <h1 className="text-2xl font-semibold">Account</h1>
                    <p className="text-muted-foreground text-sm">
                        Manage how you sign in to Saroh.
                    </p>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                        void authClient.signOut().then(() => {
                            router.push("/login");
                        })
                    }
                >
                    Sign out
                </Button>
            </header>

            <ProfileForm initialName={user.name} />
            <ChangeEmailForm currentEmail={user.email} />
            <ChangePasswordForm />
            <SessionsList currentToken={session.session.token} />
            <DeleteAccount />
        </main>
    );
}
