"use client";

import { authClient } from "@saroh/auth/client";
import { Button } from "@saroh/ui/button";

import { accountsLoginUrl } from "@/lib/accounts";

export function SignOutButton() {
    return (
        <Button
            variant="link"
            size="inline"
            type="button"
            onClick={() =>
                authClient.signOut().then(() => {
                    window.location.href = accountsLoginUrl;
                })
            }
        >
            Sign out
        </Button>
    );
}
