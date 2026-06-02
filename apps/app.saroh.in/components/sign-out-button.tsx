"use client";

import { authClient } from "@saroh/auth/client";

import { accountsLoginUrl } from "@/lib/session";

export function SignOutButton() {
    return (
        <button
            type="button"
            className="text-sm underline"
            onClick={() =>
                authClient.signOut().then(() => {
                    window.location.href = accountsLoginUrl;
                })
            }
        >
            Sign out
        </button>
    );
}
