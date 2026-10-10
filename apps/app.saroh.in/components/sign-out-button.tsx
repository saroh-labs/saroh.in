"use client";

import { authClient } from "@saroh/auth/client";

import { accountsLoginUrl } from "@/lib/accounts";
import { TextLink } from "@saroh/ui/text-link";

export function SignOutButton() {
    return (
        <TextLink
            onClick={() =>
                authClient.signOut().then(() => {
                    window.location.href = accountsLoginUrl;
                })
            }
            className="text-sm"
        >
            Sign out
        </TextLink>
    );
}
