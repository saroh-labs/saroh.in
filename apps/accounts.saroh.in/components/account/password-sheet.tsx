"use client";

import {
    CODE_CHALLENGE_HEADER,
    VERIFICATION_OTP_LENGTH,
} from "@saroh/auth/constants";
import { Button } from "@saroh/ui/button";
import { CheckRow } from "@saroh/ui/check-row";
import { Field } from "@saroh/ui/field";
import { FormSheet } from "@saroh/ui/form-sheet";
import { Input } from "@saroh/ui/input";
import { showSuccess } from "@saroh/ui/toast";
import Link from "next/link";
import { useState } from "react";

import { CodeChallenge } from "@/components/auth/code-challenge";
import { authErrorCode, authFailureCopy, settle } from "@/lib/auth-error-copy";
import { authClient } from "@/lib/auth.client";
import type { PasswordClient } from "@/lib/password";
import { passwordProblem, setFirstPassword } from "@/lib/password";
import { CODE_MINUTES, CODE_WORDS, codeDigits } from "@/lib/sign-in-code";

import { useSheetGuard } from "./use-sheet-guard";

const realClient: PasswordClient = {
    askForCode: (email, turnstileToken) =>
        authClient.emailOtp.requestPasswordReset({
            email,
            fetchOptions: turnstileToken
                ? { headers: { [CODE_CHALLENGE_HEADER]: turnstileToken } }
                : undefined,
        }),
    setWithCode: ({ email, code, password }) =>
        authClient.emailOtp.resetPassword({ email, otp: code, password }),
    signIn: ({ email, password }) =>
        authClient.signIn.email({ email, password }),
};

type Errors = Partial<
    Record<"current" | "password" | "confirm" | "code", string>
>;

const LOST = "The new password won't be saved.";

/**
 * Account › Password, in a sheet. An account with a password changes it by
 * typing the current one; "Sign out my other devices" is on by default and
 * stays visible, since signing every other device out is a consequence
 * the person should see coming. An account with none (made with an
 * emailed code, or with Google) sets its first: the password, then a code
 * sent to the account's address, which shows it is the owner asking
 * (`lib/password.ts`).
 */
export function PasswordSheet({
    open,
    email,
    has,
    onClose,
    onSet,
    client = realClient,
}: {
    open: boolean;
    email: string;
    /** The account has a password; null while unknown reads as yes. */
    has: boolean | null;
    onClose: () => void;
    /** A first password was set. */
    onSet: () => void;
    client?: PasswordClient;
}) {
    const setting = has === false;
    const [current, setCurrent] = useState("");
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [code, setCode] = useState("");
    const [signOutOthers, setSignOutOthers] = useState(true);
    const [step, setStep] = useState<"password" | "code" | "sign-in">(
        "password",
    );
    const [errors, setErrors] = useState<Errors>({});
    const [busy, setBusy] = useState(false);
    const [challenge, setChallenge] = useState(false);
    const dirty = Boolean(current || password || confirm);

    function reset() {
        setCurrent("");
        setPassword("");
        setConfirm("");
        setCode("");
        setStep("password");
        setErrors({});
    }
    const close = () => {
        reset();
        onClose();
    };
    const guard = useSheetGuard(dirty && step !== "sign-in", LOST, close);

    async function change() {
        const problem = passwordProblem(password, confirm);
        if (!current)
            return setErrors({ current: "Enter your current password." });
        if (problem) {
            return setErrors(
                password !== confirm && password.length >= 8
                    ? { confirm: problem }
                    : { password: problem },
            );
        }
        setBusy(true);
        const { error } = await settle(() =>
            authClient.changePassword({
                currentPassword: current,
                newPassword: password,
                revokeOtherSessions: signOutOthers,
            }),
        );
        setBusy(false);
        if (error) {
            setErrors({
                current: authFailureCopy(
                    error,
                    "Couldn't change your password. Try again.",
                ),
            });
            return;
        }
        showSuccess("Password changed.");
        close();
    }

    async function askForCode(turnstileToken?: string) {
        const problem = passwordProblem(password, confirm);
        if (problem) {
            return setErrors(
                password !== confirm && password.length >= 8
                    ? { confirm: problem }
                    : { password: problem },
            );
        }
        setChallenge(false);
        setBusy(true);
        const { error } = await settle(() =>
            client.askForCode(email, turnstileToken),
        );
        setBusy(false);
        if (error) {
            setErrors({
                password: authFailureCopy(
                    error,
                    "Couldn't send the code. Try again.",
                ),
            });
            // Past the address's hourly cap the API asks for the bot check.
            setChallenge(authErrorCode(error) === "CHALLENGE");
            return;
        }
        setCode("");
        setErrors({});
        setStep("code");
    }

    async function save() {
        if (codeDigits(code).length !== VERIFICATION_OTP_LENGTH) {
            return setErrors({
                code: `Enter all ${VERIFICATION_OTP_LENGTH} digits of the code.`,
            });
        }
        setBusy(true);
        const result = await setFirstPassword(client, {
            email,
            code,
            password,
        });
        setBusy(false);
        if (!result.ok) return setErrors({ code: result.message });
        onSet();
        if (result.signedIn) {
            showSuccess(
                "Password set. You can sign in with it or with a code.",
            );
            close();
        } else {
            setStep("sign-in");
        }
    }

    const set = (fn: (v: string) => void) => (v: string) => {
        fn(v);
        setErrors({});
    };

    return (
        <>
            <FormSheet
                open={open}
                title={setting ? "Set a password" : "Change your password"}
                description={
                    setting
                        ? "You sign in with a code we email you. Set a password if you'd rather type one. The code keeps working."
                        : "Change the password you sign in with."
                }
                pending={busy}
                dirty={dirty}
                onClose={guard.onClose}
                onSubmit={() =>
                    !setting
                        ? change()
                        : step === "code"
                          ? save()
                          : askForCode()
                }
                saveLabel={
                    !setting
                        ? "Change password"
                        : step === "code"
                          ? "Set password"
                          : "Email me a code"
                }
                savingLabel={
                    step === "password" && setting ? "Sending…" : "Saving…"
                }
                doneOnly={step === "sign-in"}
                doneLabel="Close"
            >
                {step === "sign-in" ? (
                    <div className="grid gap-3">
                        <p role="status" className="text-sm">
                            Password set. It signed you out on every device,
                            this one included.
                        </p>
                        <Button asChild className="w-fit">
                            <Link href="/login?with=password&redirect=/account">
                                Sign in
                            </Link>
                        </Button>
                    </div>
                ) : step === "code" ? (
                    <Field
                        label={CODE_WORDS.label}
                        hint={`We sent a ${VERIFICATION_OTP_LENGTH}-digit code to ${email}. It lasts ${CODE_MINUTES} minutes. ${CODE_WORDS.spam}`}
                        error={errors.code}
                    >
                        <Input
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            placeholder={CODE_WORDS.placeholder}
                            maxLength={VERIFICATION_OTP_LENGTH}
                            value={code}
                            onChange={(e) =>
                                set(setCode)(codeDigits(e.target.value))
                            }
                            className="font-mono tracking-[0.4em]"
                        />
                    </Field>
                ) : (
                    <>
                        {!setting ? (
                            <Field
                                label="Current password"
                                error={errors.current}
                            >
                                <Input
                                    type="password"
                                    value={current}
                                    onChange={(e) =>
                                        set(setCurrent)(e.target.value)
                                    }
                                    autoComplete="current-password"
                                />
                            </Field>
                        ) : null}
                        <Field
                            label="New password"
                            hint="Eight characters or more."
                            error={errors.password}
                        >
                            <Input
                                type="password"
                                value={password}
                                onChange={(e) =>
                                    set(setPassword)(e.target.value)
                                }
                                autoComplete="new-password"
                            />
                        </Field>
                        <Field
                            label="Confirm new password"
                            error={errors.confirm}
                        >
                            <Input
                                type="password"
                                value={confirm}
                                onChange={(e) =>
                                    set(setConfirm)(e.target.value)
                                }
                                autoComplete="new-password"
                            />
                        </Field>
                        {setting && challenge ? (
                            <CodeChallenge
                                onToken={(token) => void askForCode(token)}
                            />
                        ) : null}
                        {setting ? (
                            <p className="text-muted-foreground text-sm">
                                We email a code to {email} to check it is you.
                                Setting a password signs out your other devices.
                            </p>
                        ) : (
                            <CheckRow
                                checked={signOutOthers}
                                onChange={setSignOutOthers}
                            >
                                Sign out my other devices
                            </CheckRow>
                        )}
                    </>
                )}
                {step === "code" ? (
                    <Button
                        type="button"
                        variant="link"
                        className="h-auto w-fit p-0"
                        disabled={busy}
                        onClick={() => void askForCode()}
                    >
                        {CODE_WORDS.sendNew}
                    </Button>
                ) : null}
            </FormSheet>
            {guard.dialog}
        </>
    );
}
