"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { phoneLabel } from "@saroh/ui/lib/phone";
import { PageHeader } from "@saroh/ui/page-header";
import { Absent, Row, Section } from "@saroh/ui/settings-rows";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { authFailureCopy, settle } from "@/lib/auth-error-copy";
import { authClient } from "@/lib/auth.client";
import { day } from "@/lib/day";
import { hasPassword as readHasPassword } from "@/lib/password";
import type { PhoneOptions } from "@/lib/phone-sign-in";
import { phoneOptions } from "@/lib/phone-sign-in";

import type { SoleOwned } from "./delete-dialog";
import { DeleteDialog, deleteLine } from "./delete-dialog";
import type { DeviceSession } from "./devices-sheet";
import { DevicesSheet, devicesLine } from "./devices-sheet";
import { EmailDialog, NameDialog } from "./identity-dialogs";
import { PasswordSheet } from "./password-sheet";
import { PHONE_WORDS } from "./phone-section";
import { PhoneSheet } from "./phone-sheet";

export const PROFILE_TITLE = "Profile and sign-in";

type Open = "name" | "email" | "phone" | "password" | "devices" | "delete";

/**
 * Profile and sign-in as read-first rows (DEC-199, the owner's 10 Oct
 * rule): "label · what is saved · Change", each opening a sheet or a
 * dialog, as Billing profiles and the app's Settings do. Every capability
 * the six open cards had is kept (00-universal §15): the name; the sign-in
 * email, confirmed from the old inbox; the phone (add, change, remove,
 * WhatsApp first, SMS instead, resend, phone taken); the password (change
 * with Sign out my other devices, or set a first one by emailed code);
 * where it's signed in, one device or all the others signed out; delete,
 * with the sole-owner check and the emailed link; and Sign out.
 */
export function ProfileRows({
    name,
    email,
    phoneE164,
    phoneVerifiedAt,
    soleOwned,
}: {
    name: string;
    email: string;
    phoneE164: string | null;
    phoneVerifiedAt: string | null;
    soleOwned: SoleOwned[] | null;
}) {
    const router = useRouter();
    const { data: session } = authClient.useSession();
    const currentToken = session?.session.token;
    const [open, setOpen] = useState<Open | null>(null);
    const [phone, setPhone] = useState({
        e164: phoneE164,
        at: phoneVerifiedAt,
    });
    const [options, setOptions] = useState<PhoneOptions | null>(null);
    const [has, setHas] = useState<boolean | null>(null);
    const [sessions, setSessions] = useState<DeviceSession[] | null>(null);
    const [sessionsFailed, setSessionsFailed] = useState(false);
    const [deleteSent, setDeleteSent] = useState(false);
    const [signingOut, setSigningOut] = useState(false);
    const close = () => setOpen(null);

    // Bumped to read the devices again; every setState waits for the read.
    const [reads, setReads] = useState(0);
    const loadSessions = useCallback(() => setReads((n) => n + 1), []);

    useEffect(() => {
        let live = true;
        void settle(() => authClient.listSessions()).then(({ data, error }) => {
            if (!live) return;
            setSessionsFailed(Boolean(error));
            if (!error) setSessions(data);
        });
        return () => {
            live = false;
        };
    }, [reads]);

    useEffect(() => {
        let live = true;
        void phoneOptions().then((o) => live && setOptions(o));
        void settle(async () => {
            const { data, error } = await authClient.listAccounts();
            return { data, error };
        }).then(
            (r) => live && setHas(r.error ? null : readHasPassword(r.data)),
        );
        return () => {
            live = false;
        };
    }, []);

    const phoneOffered = options
        ? options.available || Boolean(phone.e164)
        : false;
    const change = (what: Open, label = "Change") => (
        <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setOpen(what)}
        >
            {label}
        </Button>
    );

    async function signOutDevice(token: string): Promise<string | null> {
        const { error } = await settle(() =>
            authClient.revokeSession({ token }),
        );
        if (error)
            return authFailureCopy(
                error,
                "Couldn't sign that device out. Try again.",
            );
        loadSessions();
        return null;
    }
    async function signOutOthers(): Promise<string | null> {
        const { error } = await settle(() => authClient.revokeOtherSessions());
        if (error)
            return authFailureCopy(
                error,
                "Couldn't sign the other devices out. Try again.",
            );
        loadSessions();
        return null;
    }

    return (
        <div className="max-w-[760px]">
            <PageHeader
                title={PROFILE_TITLE}
                description={`Signed in as ${email}`}
                holdsData="description"
                actions={
                    <Button
                        variant="outline"
                        busy={signingOut}
                        busyLabel="Signing out…"
                        onClick={() => {
                            setSigningOut(true);
                            void authClient
                                .signOut()
                                .then(() => router.push("/login"));
                        }}
                    >
                        Sign out
                    </Button>
                }
            />
            <div className="mt-6 grid gap-6">
                <Section title="You">
                    <Row label="Name" action={change("name")}>
                        <span data-ph-mask="">
                            {name || <Absent>Not set</Absent>}
                        </span>
                    </Row>
                </Section>
                <Section title="Signing in">
                    <Row label="Email" action={change("email")}>
                        <span
                            data-ph-mask=""
                            className="[overflow-wrap:anywhere]"
                        >
                            {email}
                        </span>
                    </Row>
                    {phoneOffered ? (
                        <Row
                            label={PHONE_WORDS.title}
                            action={change(
                                "phone",
                                phone.e164 ? "Change" : PHONE_WORDS.add,
                            )}
                        >
                            {phone.e164 ? (
                                <span className="flex flex-wrap items-center gap-2">
                                    <span
                                        data-ph-mask=""
                                        className="whitespace-nowrap"
                                    >
                                        {phoneLabel(phone.e164)}
                                    </span>
                                    <Badge variant="success" size="sm">
                                        {phone.at
                                            ? `${PHONE_WORDS.verified} ${day(phone.at, true)}`
                                            : PHONE_WORDS.verified}
                                    </Badge>
                                </span>
                            ) : (
                                <Absent>{PHONE_WORDS.none}</Absent>
                            )}
                        </Row>
                    ) : null}
                    <Row
                        label="Password"
                        action={change(
                            "password",
                            has === false ? "Set" : "Change",
                        )}
                    >
                        {has === false ? (
                            <Absent>Not set: you sign in with a code</Absent>
                        ) : (
                            "Set"
                        )}
                    </Row>
                    <Row label="Devices" action={change("devices", "Manage")}>
                        {sessions ? (
                            devicesLine(sessions, currentToken)
                        ) : sessionsFailed ? (
                            <Absent>Couldn&apos;t load</Absent>
                        ) : (
                            <Absent>Loading…</Absent>
                        )}
                    </Row>
                </Section>
                <Section title="Leaving Saroh">
                    <Row
                        label="Delete account"
                        action={
                            deleteSent ? undefined : (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="text-destructive"
                                    onClick={() => setOpen("delete")}
                                >
                                    Delete…
                                </Button>
                            )
                        }
                    >
                        {deleteSent
                            ? "Check your inbox. Your account is deleted only when you follow the link."
                            : deleteLine(soleOwned)}
                    </Row>
                </Section>
            </div>

            <NameDialog open={open === "name"} initial={name} onClose={close} />
            <EmailDialog
                open={open === "email"}
                currentEmail={email}
                onClose={close}
            />
            {options ? (
                <PhoneSheet
                    open={open === "phone"}
                    hasPhone={Boolean(phone.e164)}
                    canAdd={options.available}
                    whatsapp={options.whatsapp}
                    sms={options.sms}
                    turnstileSiteKey={options.turnstileSiteKey}
                    onClose={close}
                    onSaved={(saved) => {
                        setPhone({
                            e164: saved.phoneE164,
                            at: saved.phoneVerifiedAt,
                        });
                        close();
                    }}
                    onRemoved={() => {
                        setPhone({ e164: null, at: null });
                        close();
                    }}
                />
            ) : null}
            <PasswordSheet
                open={open === "password"}
                email={email}
                has={has}
                onClose={close}
                onSet={() => setHas(true)}
            />
            <DevicesSheet
                open={open === "devices"}
                sessions={sessions}
                failed={sessionsFailed}
                currentToken={currentToken}
                onClose={close}
                onSignOut={signOutDevice}
                onSignOutOthers={signOutOthers}
                onRetry={loadSessions}
            />
            <DeleteDialog
                open={open === "delete"}
                onOpenChange={(o) => setOpen(o ? "delete" : null)}
                email={email}
                hasPassword={has}
                soleOwned={soleOwned}
                onSent={() => setDeleteSent(true)}
            />
        </div>
    );
}
