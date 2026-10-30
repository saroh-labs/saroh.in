"use client";

import { ConfirmDialog } from "@saroh/ui/confirm-dialog";
import { Field } from "@saroh/ui/field";
import { Input } from "@saroh/ui/input";
import { useState } from "react";

import { authFailureCopy, settle } from "@/lib/auth-error-copy";
import { authClient } from "@/lib/auth.client";
import { namesList } from "@/lib/billing-profiles";

export interface SoleOwned {
    id: string;
    name: string;
    slug: string;
}

export const CONFIRM_PHRASE = "delete my account";

/** The row's line: why Delete can't go, or what it does. */
export function deleteLine(soleOwned: readonly SoleOwned[] | null): string {
    if (soleOwned === null) return "Couldn't check your businesses.";
    if (soleOwned.length === 0) return "Removes your account for good.";
    return soleOwned.length === 1
        ? "You're the only owner of a business. Hand it over first."
        : `You're the only owner of ${soleOwned.length} businesses. Hand them over first.`;
}

/**
 * Delete account, in the one confirm (DEC-199).
 *
 * Two things guard it. First a PRE-FLIGHT the page made through the API:
 * deleting the only OWNER of a business would strand it, so `@saroh/auth`'s
 * `beforeDelete` hook refuses it after the emailed link. Being refused
 * after committing is a bad way to learn a rule, so it is said here
 * first; the hook stays the authority.
 *
 * Second, deletion always completes through an emailed one-time link, so
 * a hijacked session alone can't destroy an account. An account with a
 * password types it too; one that signs in with a code has none to type,
 * and the emailed link is its proof (Better Auth's delete with no
 * password, when a verification email is configured).
 */
export function DeleteDialog({
    open,
    onOpenChange,
    email,
    hasPassword,
    soleOwned,
    onSent,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    email: string;
    /** Null while unknown: the password is asked for, as before. */
    hasPassword: boolean | null;
    soleOwned: readonly SoleOwned[] | null;
    onSent: () => void;
}) {
    const [password, setPassword] = useState("");
    const [phrase, setPhrase] = useState("");
    const askPassword = hasPassword !== false;
    const blocked = soleOwned === null || soleOwned.length > 0;

    async function confirm() {
        if (soleOwned === null) {
            return {
                ok: false,
                error: "Couldn't check your businesses. Nothing has been changed. Try again.",
            };
        }
        if (soleOwned.length > 0) {
            return {
                ok: false,
                error: "Make someone else an owner, or delete the business, first.",
            };
        }
        if (phrase.trim().toLowerCase() !== CONFIRM_PHRASE) {
            return { ok: false, error: `Type “${CONFIRM_PHRASE}” to confirm.` };
        }
        if (askPassword && !password) {
            return { ok: false, error: "Enter your password." };
        }
        const { error } = await settle(() =>
            authClient.deleteUser({
                ...(askPassword ? { password } : {}),
                callbackURL: "/login",
            }),
        );
        if (error) {
            return {
                ok: false,
                error: authFailureCopy(
                    error,
                    "Couldn't start deleting your account. Try again.",
                ),
            };
        }
        setPassword("");
        setPhrase("");
        onSent();
        return true;
    }

    return (
        <ConfirmDialog
            open={open}
            onOpenChange={onOpenChange}
            title="Delete your account?"
            description={`We'll email ${email} a link. Your account is deleted only when you follow it. This cannot be undone.`}
            confirmLabel="Delete account"
            busyLabel="Sending…"
            keepLabel="Keep account"
            onConfirm={confirm}
        >
            <div className="grid gap-3.5">
                {soleOwned && soleOwned.length > 0 ? (
                    <div className="bg-muted grid gap-1 rounded-md p-3 text-sm">
                        <span className="font-medium">
                            You&apos;re the only owner of{" "}
                            {soleOwned.length === 1
                                ? "a business"
                                : `${soleOwned.length} businesses`}
                            : {namesList(soleOwned.map((o) => o.name))}.
                        </span>
                        <span className="text-muted-foreground">
                            Make someone else an owner, or delete the business,
                            before deleting your account. Otherwise its data
                            would be left with no one able to reach it.
                        </span>
                    </div>
                ) : null}
                {askPassword ? (
                    <Field label="Your password">
                        <Input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            autoComplete="current-password"
                            disabled={blocked}
                        />
                    </Field>
                ) : null}
                <Field label={`Type “${CONFIRM_PHRASE}” to confirm`}>
                    <Input
                        value={phrase}
                        onChange={(e) => setPhrase(e.target.value)}
                        disabled={blocked}
                    />
                </Field>
            </div>
        </ConfirmDialog>
    );
}
