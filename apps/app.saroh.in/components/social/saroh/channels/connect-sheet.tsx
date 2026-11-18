"use client";

import type { ButtonProps } from "@saroh/ui/button";
import { Button } from "@saroh/ui/button";
import { FormSheet } from "@saroh/ui/form-sheet";
import { Notice } from "@saroh/ui/notice";
import { Check } from "lucide-react";
import { useState } from "react";

import { runAction } from "@/lib/api/run-action";
import { connectChannel } from "@/lib/social/saroh-social-actions";
import type { SocialChannel } from "@/lib/social/saroh-social-types";
import { CONNECT_NEEDS, SOCIAL_WORDS } from "@/lib/social/saroh-social-words";

/**
 * Connect or Reconnect, explained before Meta's own screen (S2; the
 * Buffer connect flow the research ranked best): what the channel needs,
 * in three lines, then Continue sends the person to Meta. They come back
 * to Channels, where the row says how it went.
 */
export function ConnectButton({
    channel,
    variant = "default",
    size,
    className,
}: {
    channel: SocialChannel;
    variant?: ButtonProps["variant"];
    size?: ButtonProps["size"];
    className?: string;
}) {
    const [open, setOpen] = useState(false);
    const again = channel.state === "NEEDS_ATTENTION";
    return (
        <>
            <Button
                type="button"
                variant={variant}
                size={size}
                className={className}
                onClick={() => setOpen(true)}
                data-connect={channel.kind}
            >
                {again
                    ? SOCIAL_WORDS.reconnect
                    : SOCIAL_WORDS.connect(channel.kind)}
            </Button>
            <ConnectSheet
                channel={channel}
                open={open}
                onClose={() => setOpen(false)}
            />
        </>
    );
}

function ConnectSheet({
    channel,
    open,
    onClose,
}: {
    channel: SocialChannel;
    open: boolean;
    onClose: () => void;
}) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const kind = channel.kind;

    async function go() {
        setError(null);
        const res = await runAction(() => connectChannel(kind), {
            setBusy,
            onUnreached: setError,
            quiet: true,
        });
        if (!res) return;
        if (!res.ok) return setError(res.error);
        // Meta's consent is a page of its own: the person comes back to Channels.
        setBusy(true);
        window.location.assign(res.data.url);
    }

    return (
        <FormSheet
            open={open}
            bottomOnPhone
            title={
                channel.state === "NEEDS_ATTENTION"
                    ? SOCIAL_WORDS.reconnectTitle(kind)
                    : SOCIAL_WORDS.connectTitle(kind)
            }
            description={SOCIAL_WORDS.connectWhat}
            pending={busy}
            dirty={false}
            saveLabel={SOCIAL_WORDS.continue}
            savingLabel={SOCIAL_WORDS.connecting}
            saveOff={!channel.canConnect}
            onClose={onClose}
            onSubmit={() => go()}
        >
            <ul data-connect-needs={kind} className="grid gap-3">
                {CONNECT_NEEDS[kind].map((line) => (
                    <li key={line} className="flex gap-2.5 text-[14px]">
                        <Check
                            aria-hidden
                            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                        />
                        <span className="text-pretty">{line}</span>
                    </li>
                ))}
            </ul>
            {channel.canConnect ? null : (
                <Notice tone="neutral">{SOCIAL_WORDS.notSetUp}</Notice>
            )}
            {error ? (
                <Notice tone="error" role="alert" data-connect-error="">
                    {error}
                </Notice>
            ) : null}
        </FormSheet>
    );
}
