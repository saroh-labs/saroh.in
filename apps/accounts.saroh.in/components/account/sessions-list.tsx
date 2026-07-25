"use client";

import { authClient } from "@/lib/auth.client";
import { Button } from "@saroh/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@saroh/ui/card";
import { useEffect, useState } from "react";

interface SessionRow {
    id: string;
    token: string;
    createdAt: string | Date;
    expiresAt: string | Date;
    userAgent?: string | null;
    ipAddress?: string | null;
}

/** Best-effort device label. The raw UA string is noise to a human reader. */
function describeDevice(userAgent?: string | null): string {
    if (!userAgent) return "Unknown device";
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
              : "Browser";
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
                    : "Unknown OS";
    return `${browser} on ${os}`;
}

function formatDate(value: string | Date): string {
    return new Date(value).toLocaleString();
}

/**
 * Active sessions with per-session revoke — the answer to "am I still signed in
 * somewhere I shouldn't be?".
 *
 * The CURRENT session is marked and cannot be revoked here: signing yourself out
 * mid-page is what the Sign out action is for, and mixing the two invites a
 * confusing dead-end state. Everything else is revocable individually.
 */
export function SessionsList({ currentToken }: { currentToken?: string }) {
    const [sessions, setSessions] = useState<SessionRow[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [revoking, setRevoking] = useState<string | null>(null);
    // Bumped after a successful revoke to re-run the load effect. Reloading via
    // a key rather than calling a shared loader keeps every setState inside the
    // effect, after an await, and lets the cleanup below discard a response that
    // arrives once this component is gone.
    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => {
        // AbortController rather than a `let cancelled` flag: its `aborted` is a
        // real boolean, where a local initialised to `true` narrows to the
        // literal type and makes the guard look statically dead.
        const controller = new AbortController();
        void (async () => {
            const { data, error: err } = await authClient.listSessions();
            if (controller.signal.aborted) return;
            if (err) {
                setError(err.message ?? "Could not load your sessions.");
                return;
            }
            setError(null);
            setSessions(data);
        })();
        return () => {
            controller.abort();
        };
    }, [reloadKey]);

    async function revoke(token: string) {
        setRevoking(token);
        const { error: err } = await authClient.revokeSession({ token });
        setRevoking(null);
        if (err) {
            setError(err.message ?? "Could not revoke that session.");
            return;
        }
        setReloadKey((key) => key + 1);
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Active sessions</CardTitle>
                <CardDescription>
                    Where your account is currently signed in. Revoke anything
                    you don&apos;t recognise.
                </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
                {error && <p className="text-destructive text-sm">{error}</p>}
                {sessions === null && !error && (
                    <p className="text-muted-foreground text-sm">Loading…</p>
                )}
                {sessions?.length === 0 && (
                    <p className="text-muted-foreground text-sm">
                        No other sessions.
                    </p>
                )}
                {sessions?.map((session) => {
                    const isCurrent = session.token === currentToken;
                    return (
                        <div
                            key={session.token}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
                        >
                            <div className="grid gap-0.5">
                                <span className="text-sm font-medium">
                                    {describeDevice(session.userAgent)}
                                    {isCurrent && (
                                        <span className="text-muted-foreground ml-2 text-xs font-normal">
                                            (this device)
                                        </span>
                                    )}
                                </span>
                                <span className="text-muted-foreground text-xs">
                                    Signed in {formatDate(session.createdAt)} ·
                                    expires {formatDate(session.expiresAt)}
                                </span>
                            </div>
                            {!isCurrent && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => void revoke(session.token)}
                                    disabled={revoking === session.token}
                                >
                                    {revoking === session.token
                                        ? "Revoking…"
                                        : "Revoke"}
                                </Button>
                            )}
                        </div>
                    );
                })}
            </CardContent>
        </Card>
    );
}
