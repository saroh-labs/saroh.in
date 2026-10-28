"use client";

import { Field } from "@saroh/ui/field";
import { FormDialog } from "@saroh/ui/form-dialog";
import { Input } from "@saroh/ui/input";
import { showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { authFailureCopy, settle } from "@/lib/auth-error-copy";
import { authClient } from "@/lib/auth.client";

import { useSheetGuard } from "./use-sheet-guard";

/**
 * Name: one field in a dialog. The only freely editable identity field;
 * the email moves through the verified change below.
 */
export function NameDialog({
    open,
    initial,
    onClose,
}: {
    open: boolean;
    initial: string;
    onClose: () => void;
}) {
    const router = useRouter();
    const [name, setName] = useState(initial);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const dirty = name !== initial;
    const close = () => {
        setName(initial);
        setError(null);
        onClose();
    };
    const guard = useSheetGuard(dirty, "Your new name won't be saved.", close);

    async function save() {
        if (!name.trim()) {
            setError("Enter your name.");
            return;
        }
        setBusy(true);
        const { error: err } = await settle(() =>
            authClient.updateUser({ name: name.trim() }),
        );
        setBusy(false);
        if (err) {
            setError(
                authFailureCopy(err, "Couldn't save your name. Try again."),
            );
            return;
        }
        showSuccess("Name saved.");
        onClose();
        router.refresh();
    }

    return (
        <>
            <FormDialog
                open={open}
                title="Name"
                description="Your teammates see this across Saroh."
                pending={busy}
                dirty={dirty}
                onClose={guard.onClose}
                onSubmit={() => save()}
            >
                <Field label="Name" error={error}>
                    <Input
                        value={name}
                        onChange={(e) => {
                            setName(e.target.value);
                            setError(null);
                        }}
                        maxLength={120}
                        autoComplete="name"
                    />
                </Field>
            </FormDialog>
            {guard.dialog}
        </>
    );
}

/**
 * Change the sign-in email.
 *
 * The confirmation link goes to the CURRENT address, not the new one: the
 * holder of the existing mailbox authorises the move, so someone who
 * briefly has your session cannot walk your account to an address they
 * control. Nothing changes until that link is followed.
 */
export function EmailDialog({
    open,
    currentEmail,
    onClose,
}: {
    open: boolean;
    currentEmail: string;
    onClose: () => void;
}) {
    const [newEmail, setNewEmail] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const close = () => {
        setNewEmail("");
        setError(null);
        onClose();
    };
    const guard = useSheetGuard(
        newEmail.trim() !== "",
        "The new email won't be sent for confirmation.",
        close,
    );

    async function send() {
        const typed = newEmail.trim();
        if (!typed) {
            setError("Enter the new email.");
            return;
        }
        if (typed.toLowerCase() === currentEmail.toLowerCase()) {
            setError("That is already your email address.");
            return;
        }
        setBusy(true);
        const { error: err } = await settle(() =>
            authClient.changeEmail({
                newEmail: typed,
                callbackURL: "/account",
            }),
        );
        setBusy(false);
        if (err) {
            setError(
                authFailureCopy(
                    err,
                    "Couldn't start the email change. Try again.",
                ),
            );
            return;
        }
        showSuccess(
            `Check ${currentEmail} for a confirmation link.`,
            "Your email changes only once you follow it.",
        );
        close();
    }

    return (
        <>
            <FormDialog
                open={open}
                title="Sign-in email"
                description={`We'll email ${currentEmail} to confirm. Nothing changes until you follow that link.`}
                pending={busy}
                onClose={guard.onClose}
                onSubmit={() => send()}
                saveLabel="Send confirmation"
                savingLabel="Sending…"
            >
                <Field label="New email" error={error}>
                    <Input
                        type="email"
                        value={newEmail}
                        onChange={(e) => {
                            setNewEmail(e.target.value);
                            setError(null);
                        }}
                        autoComplete="email"
                    />
                </Field>
            </FormDialog>
            {guard.dialog}
        </>
    );
}
