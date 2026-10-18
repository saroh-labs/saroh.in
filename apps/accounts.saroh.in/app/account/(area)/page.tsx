"use client";

import { ChangeEmailForm } from "@/components/account/change-email-form";
import { DeleteAccount } from "@/components/account/delete-account";
import { PasswordSection } from "@/components/account/password-section";
import { ProfileForm } from "@/components/account/profile-form";
import { SessionsList } from "@/components/account/sessions-list";
import { AuthHeading, AuthNote } from "@/components/auth/field";
import { authClient } from "@/lib/auth.client";
import { Button } from "@saroh/ui/button";
import { Skeleton } from "@saroh/ui/skeleton";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Account settings: the user's own identity, owned by accounts.saroh.in
 * because this app is the single identity provider. The product apps
 * (app.saroh.in, admin) deliberately do NOT duplicate any of this. They link
 * here from their header user menu.
 *
 * Everything here acts on the SESSION USER only, never on an id from the URL,
 * so there is no surface on which to act as someone else.
 *
 * In the account area's frame since Billing profiles joined it (DEC-167
 * step 2, `app/account/(area)/layout.tsx`): the top bar, Back to Saroh and
 * the menu are the frame's; the sections here are unchanged. Loading,
 * failed and signed out keep to the same column, so the page never
 * arrives as a different layout from the one it was waiting as.
 */
function Frame({ children }: { children: ReactNode }) {
    return <div className="max-w-[760px]">{children}</div>;
}

export default function AccountPage() {
    const router = useRouter();
    const { data: session, isPending, error } = authClient.useSession();

    if (isPending) {
        return (
            <Frame>
                <div role="status" aria-busy="true">
                    <span className="sr-only">Loading your account</span>
                    <div aria-hidden className="grid gap-5">
                        <Skeleton className="h-7 w-40" />
                        <Skeleton className="h-4 w-64" />
                        <Skeleton className="h-36 w-full" />
                        <Skeleton className="h-36 w-full" />
                    </div>
                </div>
            </Frame>
        );
    }

    if (error) {
        return (
            <Frame>
                <AuthHeading title="Account" />
                {/* The session could not be read. The library's own
                    message is never shown (`lib/auth-error-copy.ts`). */}
                <div role="alert" className="mt-[22px]">
                    <AuthNote title="Couldn't load your account">
                        Nothing has been changed.
                    </AuthNote>
                </div>
                <Button asChild className="sa-cta w-full">
                    <a href="/account">Try again</a>
                </Button>
            </Frame>
        );
    }

    if (!session?.user) {
        return (
            <Frame>
                <AuthHeading
                    title="Account"
                    blurb="Sign in to manage your account."
                />
                <Button asChild className="sa-cta w-full">
                    <Link href="/login?redirect=/account">Sign in</Link>
                </Button>
            </Frame>
        );
    }

    const { user } = session;

    return (
        <Frame>
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
                <div className="min-w-0">
                    <h1 className="sa-rise font-display text-[25px] font-semibold leading-[1.15] tracking-[-0.03em]">
                        Account
                    </h1>
                    <p className="sa-rise text-muted-foreground mt-[7px] text-[13px] leading-[1.55] [overflow-wrap:anywhere]">
                        Signed in as {user.email}
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
            </div>

            <div className="mt-[22px] grid gap-5">
                <ProfileForm initialName={user.name} />
                <ChangeEmailForm currentEmail={user.email} />
                <PasswordSection email={user.email} />
                <SessionsList currentToken={session.session.token} />
                <DeleteAccount />
            </div>
        </Frame>
    );
}
