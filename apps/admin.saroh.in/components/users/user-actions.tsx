"use client";

import { CopyButton } from "@saroh/ui/copy-button";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";

import {
    changeSignInEmailAction,
    confirmSignInEmailAction,
    endSessionsAction,
    markVerifiedAction,
    sendSignInCodeAction,
} from "@/lib/people-actions";
import { useChangeFeedback } from "@/lib/use-change-feedback";

import { OperatorDialog } from "../operator-dialog";

/**
 * The user page's header actions (admin console U9, R13): Send a sign-in
 * code, Mark verified…, Change sign-in email…, Sign out everywhere… and
 * Copy id. The page draws them only for `people:sign-in-help`; the API
 * refuses without it regardless. Each write is an `OperatorDialog` with a
 * reason, and a past-tense toast when it lands.
 */
export function UserActions({
    userId,
    name,
    email,
    emailVerified,
    held,
    sessions,
    canEndSessions,
}: {
    userId: string;
    name: string;
    email: string;
    emailVerified: boolean;
    /** A changed sign-in email is held: no code, no Mark verified. */
    held: boolean;
    sessions: number;
    /** Sign out everywhere needs `organization:people:write` too. */
    canEndSessions: boolean;
}) {
    const feedback = useChangeFeedback();
    return (
        <div className="flex flex-wrap items-start gap-2">
            <OperatorDialog
                trigger="Send a sign-in code"
                title={`Send ${name} a sign-in code`}
                effect={`A sign-in code goes to ${email}, the same code the sign-in page sends. It works for ten minutes. At most three an hour for one person.`}
                disabled={held}
                disabledReason="Held after the email change."
                submitLabel="Send code"
                quickReasons={[
                    "Code didn't arrive",
                    "Asked on a call",
                    "Asked on chat",
                ]}
                onSubmit={async ({ reason, idempotencyKey }) => {
                    const result = await sendSignInCodeAction(userId, {
                        reason,
                        idempotencyKey,
                    });
                    if (result.ok) {
                        feedback.report({
                            message: `Sign-in code sent to ${result.data.to}`,
                        });
                    }
                    return result;
                }}
            />
            <OperatorDialog
                trigger="Mark verified…"
                title={`Mark ${email} verified`}
                effect={
                    <>
                        Only once you've checked the address is theirs. Any
                        password on the account is removed and they're signed
                        out everywhere: it was set before anyone proved the
                        address, so it may not be theirs. They sign in with a
                        code and can set a new password. It is recorded as
                        verified by Saroh staff, never as their own proof: it
                        doesn't count for a staff invite or for who brought a
                        business in until they next sign in with a code.
                    </>
                }
                disabled={emailVerified || held}
                disabledReason={
                    held
                        ? "Held after the email change."
                        : "Their email is already verified."
                }
                submitLabel="Mark verified"
                onSubmit={async ({ reason, idempotencyKey }) => {
                    const result = await markVerifiedAction(userId, {
                        reason,
                        idempotencyKey,
                    });
                    if (result.ok) {
                        feedback.report({
                            message: `${email} marked verified`,
                        });
                    }
                    return result;
                }}
            />
            <ChangeSignInEmail userId={userId} name={name} email={email} />
            {canEndSessions && (
                <OperatorDialog
                    trigger="Sign out everywhere…"
                    title={`Sign ${name} out everywhere`}
                    effect={`Ends ${sessions === 1 ? "their one open session" : `all ${sessions} of their open sessions`}. Their next request asks them to sign in again. Use this when an account may be compromised.`}
                    destructive
                    disabled={sessions === 0}
                    disabledReason="They have no open sessions."
                    submitLabel="End sessions"
                    onSubmit={async ({ reason, idempotencyKey }) => {
                        const result = await endSessionsAction(userId, {
                            reason,
                            idempotencyKey,
                        });
                        if (result.ok) {
                            feedback.report({
                                message: `${name} signed out everywhere`,
                            });
                        }
                        return result;
                    }}
                />
            )}
            <CopyButton
                value={userId}
                label="Copy id"
                thing="account id"
                icon={false}
            />
        </div>
    );
}

/** Change sign-in email…, with its safeguards said before the save. */
function ChangeSignInEmail({
    userId,
    name,
    email,
}: {
    userId: string;
    name: string;
    email: string;
}) {
    const feedback = useChangeFeedback();
    return (
        <OperatorDialog
            trigger="Change sign-in email…"
            title={`Change ${name}'s sign-in email`}
            destructive
            effect={
                <ul className="grid list-disc gap-1 pl-5">
                    <li>
                        {email} is told, with the new address partly hidden.
                    </li>
                    <li>
                        The new address starts unverified, and every open
                        session ends.
                    </li>
                    <li>
                        For 24 hours no sign-in code goes to it and no sign-in
                        works, unless a second staff member confirms the change.
                    </li>
                    <li>
                        An owner of a business on a paid plan can be changed
                        only by a Platform owner.
                    </li>
                </ul>
            }
            fields={
                <div className="grid gap-1.5">
                    <Label htmlFor={`new-email-${userId}`}>
                        New sign-in email
                    </Label>
                    <Input
                        id={`new-email-${userId}`}
                        name="email"
                        type="email"
                        autoComplete="off"
                        required
                        maxLength={254}
                    />
                </div>
            }
            submitLabel="Change email"
            onSubmit={async ({ reason, idempotencyKey, values }) => {
                const result = await changeSignInEmailAction(userId, {
                    reason,
                    idempotencyKey,
                    email: (values.email ?? "").trim(),
                });
                if (result.ok) {
                    feedback.report({
                        message: "Sign-in email changed",
                        description:
                            "Its code is held for 24 hours unless a second staff member confirms. Kept with your name in the audit trail.",
                    });
                }
                return result;
            }}
        />
    );
}

/**
 * Confirm a held change as the second staff member: the new address gets
 * its sign-in code now. Shown to anyone with sign-in help but the person
 * who made the change; the API refuses them too.
 */
export function ConfirmEmailChange({
    userId,
    newEmail,
    requestedBy,
}: {
    userId: string;
    newEmail: string;
    requestedBy: string;
}) {
    const feedback = useChangeFeedback();
    return (
        <OperatorDialog
            trigger="Confirm the change…"
            title="Confirm the sign-in email change"
            effect={`${requestedBy} changed it to ${newEmail}. Confirming sends a sign-in code there now and lets them sign in, instead of waiting out the 24 hours. Confirm only once you've checked the request yourself.`}
            submitLabel="Confirm and send code"
            onSubmit={async ({ reason, idempotencyKey }) => {
                const result = await confirmSignInEmailAction(userId, {
                    reason,
                    idempotencyKey,
                });
                if (result.ok) {
                    feedback.report({
                        message: "Change confirmed and code sent",
                    });
                }
                return result;
            }}
        />
    );
}
