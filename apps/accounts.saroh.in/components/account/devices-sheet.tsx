"use client";

import { Button } from "@saroh/ui/button";
import { FailedState } from "@saroh/ui/data-state";
import { FormSheet } from "@saroh/ui/form-sheet";
import { showSuccess } from "@saroh/ui/toast";
import { useState } from "react";

import { day } from "@/lib/day";

export interface DeviceSession {
    id: string;
    token: string;
    createdAt: string | Date;
    userAgent?: string | null;
}

/** Best-effort device label. The raw UA string is noise to a human reader. */
export function describeDevice(userAgent?: string | null): string {
    if (!userAgent) return "A browser";
    // Edge before Chrome, and Chrome before Safari: both later strings appear in
    // the earlier browsers' UA, so the loosest match has to come last.
    const browser = userAgent.includes("Edg")
        ? "Edge"
        : userAgent.includes("Chrome")
          ? "Chrome"
          : userAgent.includes("Safari")
            ? "Safari"
            : userAgent.includes("Firefox")
              ? "Firefox"
              : "A browser";
    const os =
        userAgent.includes("Macintosh") || userAgent.includes("Mac OS")
            ? "macOS"
            : userAgent.includes("Windows")
              ? "Windows"
              : userAgent.includes("Android")
                ? "Android"
                : userAgent.includes("iPhone") || userAgent.includes("iPad")
                  ? "iOS"
                  : userAgent.includes("Linux")
                    ? "Linux"
                    : null;
    return os ? `${browser} on ${os}` : browser;
}

/** "2 signed in · this Chrome on macOS", for the row. */
export function devicesLine(
    sessions: readonly DeviceSession[],
    currentToken: string | undefined,
): string {
    const here = sessions.find((s) => s.token === currentToken);
    const n = `${sessions.length} signed in`;
    return here ? `${n} · this ${describeDevice(here.userAgent)}` : n;
}

/**
 * Where the account is signed in, with Sign out per device and Sign out
 * everywhere else: the answer to "am I still signed in somewhere I
 * shouldn't be?". This device is marked and has no Sign out of its own:
 * the page's Sign out is for that.
 */
export function DevicesSheet({
    open,
    sessions,
    failed,
    currentToken,
    onClose,
    onSignOut,
    onSignOutOthers,
    onRetry,
}: {
    open: boolean;
    sessions: readonly DeviceSession[] | null;
    failed: boolean;
    currentToken: string | undefined;
    onClose: () => void;
    /** Signs one device out; its refusal, or null. */
    onSignOut: (token: string) => Promise<string | null>;
    onSignOutOthers: () => Promise<string | null>;
    onRetry: () => void;
}) {
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const others = (sessions ?? []).filter((s) => s.token !== currentToken);

    async function run(
        key: string,
        act: () => Promise<string | null>,
        done: string,
    ) {
        setBusy(key);
        setError(null);
        const refused = await act();
        setBusy(null);
        if (refused) setError(refused);
        else showSuccess(done);
    }

    return (
        <FormSheet
            open={open}
            title="Devices"
            description="Where your account is signed in. Sign out any you don't recognise."
            onClose={onClose}
            doneOnly
            doneLabel="Close"
        >
            {failed ? (
                <FailedState
                    size="inline"
                    title="Couldn't load where you're signed in"
                    onRetry={onRetry}
                />
            ) : null}
            {error ? (
                <p role="alert" className="text-destructive text-[12.5px]">
                    {error}
                </p>
            ) : null}
            <ul className="divide-border grid divide-y rounded-lg border">
                {(sessions ?? []).map((s) => {
                    const here = s.token === currentToken;
                    return (
                        <li
                            key={s.id}
                            className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-3"
                        >
                            <div className="grid gap-0.5">
                                <span className="text-sm font-medium">
                                    {describeDevice(s.userAgent)}
                                    {here ? (
                                        <span className="text-muted-foreground ml-2 text-xs font-normal">
                                            This device
                                        </span>
                                    ) : null}
                                </span>
                                <span className="text-muted-foreground text-xs">
                                    Signed in {day(s.createdAt)}
                                </span>
                            </div>
                            {here ? null : (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    busy={busy === s.token}
                                    busyLabel="Signing out…"
                                    disabled={busy !== null}
                                    onClick={() =>
                                        void run(
                                            s.token,
                                            () => onSignOut(s.token),
                                            "Signed that device out.",
                                        )
                                    }
                                >
                                    Sign out
                                </Button>
                            )}
                        </li>
                    );
                })}
            </ul>
            {others.length > 0 ? (
                <Button
                    type="button"
                    variant="outline"
                    className="w-fit"
                    busy={busy === "others"}
                    busyLabel="Signing out…"
                    disabled={busy !== null}
                    onClick={() =>
                        void run(
                            "others",
                            onSignOutOthers,
                            "Signed out everywhere else.",
                        )
                    }
                >
                    Sign out everywhere else
                </Button>
            ) : null}
        </FormSheet>
    );
}
