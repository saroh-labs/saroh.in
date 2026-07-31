"use client";

import { authClient } from "@saroh/auth/client";
import { Button } from "@saroh/ui/button";

import { accountsLoginUrl } from "@/lib/admin-access";

export function SignOutButton() {
    return (
        <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
                void authClient.signOut().then(() => {
                    window.location.href = accountsLoginUrl;
                })
            }
        >
            Sign out
        </Button>
    );
}
