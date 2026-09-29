"use client";

import { authClient } from "@saroh/auth/client";

import { accountsLoginUrl } from "@/lib/accounts";

export function SignOutButton() {
    return (
        <button
            type="button"
            className="cursor-pointer text-sm underline hover:decoration-2 active:text-muted-foreground"
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
