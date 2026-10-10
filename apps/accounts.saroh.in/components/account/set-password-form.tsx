"use client";

import { VERIFICATION_OTP_LENGTH } from "@saroh/auth/constants";
import { Button } from "@saroh/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@saroh/ui/card";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import Link from "next/link";
import { useState } from "react";

import { authFailureCopy, settle } from "@/lib/auth-error-copy";
import { authClient } from "@/lib/auth.client";
import type { PasswordClient } from "@/lib/password";
import { passwordProblem, setFirstPassword } from "@/lib/password";
import { CODE_MINUTES, CODE_WORDS, codeDigits } from "@/lib/sign-in-code";

const realClient: PasswordClient = {
    askForCode: (email) => authClient.emailOtp.requestPasswordReset({ email }),
    setWithCode: ({ email, code, password }) =>
        authClient.emailOtp.resetPassword({ email, otp: code, password }),
    signIn: ({ email, password }) =>
        authClient.signIn.email({ email, password }),
};

/**
 * Set a password on an account that has none (it signs in with an emailed
 * code, or with Google). Two steps in one card: the password, then the code
 * sent to the account's address, which is what shows it is the owner asking
 * (`lib/password.ts`).
 */
export function SetPasswordForm({
    email,
    onSet,
    client = realClient,
}: {
    email: string;
    /** The account now has a password. */
    onSet: () => void;
    client?: PasswordClient;
}) {
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [code, setCode] = useState("");
    const [step, setStep] = useState<"password" | "code" | "sign-in">(
        "password",
    );
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    async function askForCode() {
        setError(null);
        const problem = passwordProblem(password, confirm);
        if (problem) {
            setError(problem);
            return;
        }
        setIsLoading(true);
        const { error: err } = await settle(() => client.askForCode(email));
        setIsLoading(false);
        if (err) {
            setError(
                authFailureCopy(err, "Couldn't send the code. Try again."),
            );
            return;
        }
        setCode("");
        setStep("code");
    }

    async function save() {
        setError(null);
        if (codeDigits(code).length !== VERIFICATION_OTP_LENGTH) {
            setError(
                `Enter all ${VERIFICATION_OTP_LENGTH} digits of the code.`,
            );
            return;
        }
        setIsLoading(true);
        const result = await setFirstPassword(client, {
            email,
            code,
            password,
        });
        setIsLoading(false);
        if (!result.ok) {
            setError(result.message);
            return;
        }
        if (result.signedIn) onSet();
        else setStep("sign-in");
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Password</CardTitle>
                <CardDescription>
                    You sign in with a code we email you. Set a password if you
                    would rather type one. The code keeps working.
                </CardDescription>
            </CardHeader>
            <CardContent>
                {step === "sign-in" ? (
                    <div className="grid max-w-sm gap-3">
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
                ) : (
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            void (step === "password" ? askForCode() : save());
                        }}
                        className="grid max-w-sm gap-4"
                        noValidate
                    >
                        {error ? (
                            <p
                                role="alert"
                                className="text-destructive text-sm"
                            >
                                {error}
                            </p>
                        ) : null}
                        {step === "password" ? (
                            <>
                                <div className="grid gap-2">
                                    <Label htmlFor="setPassword">
                                        New password
                                    </Label>
                                    <Input
                                        id="setPassword"
                                        type="password"
                                        value={password}
                                        onChange={(e) =>
                                            setPassword(e.target.value)
                                        }
                                        autoComplete="new-password"
                                        aria-describedby="setPassword-note"
                                        disabled={isLoading}
                                        className="coarse:text-base"
                                    />
                                    <p
                                        id="setPassword-note"
                                        className="text-muted-foreground text-sm"
                                    >
                                        Eight characters or more.
                                    </p>
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="setPasswordConfirm">
                                        Confirm new password
                                    </Label>
                                    <Input
                                        id="setPasswordConfirm"
                                        type="password"
                                        value={confirm}
                                        onChange={(e) =>
                                            setConfirm(e.target.value)
                                        }
                                        autoComplete="new-password"
                                        disabled={isLoading}
                                        className="coarse:text-base"
                                    />
                                </div>
                                <p className="text-muted-foreground text-sm">
                                    We email a code to {email} to check it is
                                    you. Setting a password signs out your other
                                    devices.
                                </p>
                                <Button
                                    type="submit"
                                    disabled={isLoading}
                                    className="w-fit"
                                >
                                    {isLoading ? "Sending…" : "Email me a code"}
                                </Button>
                            </>
                        ) : (
                            <>
                                <div className="grid gap-2">
                                    <Label htmlFor="setPasswordCode">
                                        {CODE_WORDS.label}
                                    </Label>
                                    <Input
                                        id="setPasswordCode"
                                        type="text"
                                        inputMode="numeric"
                                        autoComplete="one-time-code"
                                        placeholder={CODE_WORDS.placeholder}
                                        maxLength={VERIFICATION_OTP_LENGTH}
                                        value={code}
                                        onChange={(e) =>
                                            setCode(codeDigits(e.target.value))
                                        }
                                        aria-describedby="setPasswordCode-note"
                                        disabled={isLoading}
                                        className="coarse:text-base font-mono tracking-[0.4em]"
                                    />
                                    <p
                                        id="setPasswordCode-note"
                                        className="text-muted-foreground text-sm"
                                    >
                                        We sent a {VERIFICATION_OTP_LENGTH}
                                        -digit code to {email}. It lasts{" "}
                                        {CODE_MINUTES} minutes.{" "}
                                        {CODE_WORDS.spam}
                                    </p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <Button type="submit" disabled={isLoading}>
                                        {isLoading
                                            ? "Setting…"
                                            : "Set password"}
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        disabled={isLoading}
                                        onClick={() => void askForCode()}
                                    >
                                        {CODE_WORDS.sendNew}
                                    </Button>
                                </div>
                            </>
                        )}
                    </form>
                )}
            </CardContent>
        </Card>
    );
}
