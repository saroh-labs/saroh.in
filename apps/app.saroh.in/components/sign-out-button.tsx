"use client";

import { authClient } from "@saroh/auth/client";

import { accountsLoginUrl } from "@/lib/accounts";
import { afterSignOut } from "@/lib/query/invalidate";
import { TextLink } from "@saroh/ui/text-link";

export function SignOutButton() {
    return (
        <TextLink
            data-ph-unmask=""
            onClick={() =>
                authClient.signOut().then(() => {
                    afterSignOut();
                    window.location.href = accountsLoginUrl;
                })
            }
            className="text-sm"
        >
            Sign out
        </TextLink>
    );
}
