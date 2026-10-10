"use client";

import { useEffect, useState } from "react";

import { ChangePasswordForm } from "@/components/account/change-password-form";
import { SetPasswordForm } from "@/components/account/set-password-form";
import { settle } from "@/lib/auth-error-copy";
import { authClient } from "@/lib/auth.client";
import { hasPassword } from "@/lib/password";

/**
 * The account page's Password card. An account that has a password changes
 * it by typing the current one. An account that has none (it was made with
 * an emailed code, or with Google) sets its first.
 *
 * Which it is comes from the account's linked ways to sign in. Until that is
 * read, and when it can't be, the change form shows: it is right for every
 * account made before a code could make one.
 */
export function PasswordSection({ email }: { email: string }) {
    const [has, setHas] = useState<boolean | null>(null);
    const [justSet, setJustSet] = useState(false);

    useEffect(() => {
        let live = true;
        void settle(async () => {
            const { data, error } = await authClient.listAccounts();
            return { data, error };
        }).then((result) => {
            if (live) setHas(result.error ? null : hasPassword(result.data));
        });
        return () => {
            live = false;
        };
    }, []);

    if (has === false) {
        return (
            <SetPasswordForm
                email={email}
                onSet={() => {
                    setHas(true);
                    setJustSet(true);
                }}
            />
        );
    }
    return <ChangePasswordForm justSet={justSet} />;
}
