"use client";

import { authClient } from "./client";

const accountsUrl =
    process.env.NEXT_PUBLIC_ACCOUNTS_URL ?? "https://accounts.saroh.in";

/**
 * Session-aware nav element for the public apps. Client-only: it reads the
 * session over HTTP via `useSession` (no DB, no BETTER_AUTH_SECRET), so the
 * marketing/docs/showcase apps stay free of server auth. Renders a "Sign in"
 * link when logged out and the user's name + sign-out when logged in. It
 * never gates content — purely informational.
 */
export function AuthStatus({ className }: { className?: string }) {
    const { data: session, isPending } = authClient.useSession();

    if (isPending) {
        return <span className={className} aria-hidden />;
    }

    if (!session) {
        return (
            <a
                href={`${accountsUrl}/login`}
                className={className ?? "text-sm font-medium underline"}
            >
                Sign in
            </a>
        );
    }

    return (
        <span
            className={
                className ?? "flex items-center gap-3 text-sm font-medium"
            }
        >
            <span>{session.user.name || session.user.email}</span>
            <button
                type="button"
                className="underline"
                onClick={() => authClient.signOut()}
            >
                Sign out
            </button>
        </span>
    );
}
