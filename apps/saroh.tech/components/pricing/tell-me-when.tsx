"use client";

import { Button } from "@saroh/marketing/button";
import { ChallengeWidget } from "@saroh/site-blocks/challenge";
import type { FormEvent } from "react";
import { useId, useRef, useState } from "react";

import { Field } from "@/components/shared/field";
import { PRICING } from "@/content/pricing";
import { emailLooksRight, sendTellMeWhen } from "@/lib/tell-me-when";
import { site } from "@/site.config";

const copy = PRICING.tellMe;

type Send = "idle" | "sending" | "failed" | "check";

/**
 * "Tell me when" under a paid plan (Global launch plan KTD8). A press opens
 * one email field and Turnstile's check; once sent the button says "We'll
 * tell you", whether or not the address was already on the list (the API
 * answers both alike). A failed send keeps the email typed.
 */
export function TellMeWhen({ plan }: { plan: string }) {
    const id = useId();
    const [open, setOpen] = useState(false);
    const [asked, setAsked] = useState(false);
    const [email, setEmail] = useState("");
    const [badEmail, setBadEmail] = useState(false);
    const [send, setSend] = useState<Send>("idle");
    // A token passes once: each send draws a fresh check.
    const [round, setRound] = useState(0);
    const token = useRef<string | null>(null);

    if (asked || !open) {
        return (
            <div className="grid justify-items-start gap-2">
                <Button
                    variant="secondary"
                    size="sm"
                    disabled={asked}
                    onClick={() => setOpen(true)}
                    data-cta={`tell-me-when-${plan}`}
                >
                    {asked ? copy.asked : copy.ask}
                </Button>
                {asked ? (
                    <p
                        role="status"
                        className="m-0 text-[14px] text-muted-foreground"
                    >
                        {copy.askedLine}
                    </p>
                ) : null}
            </div>
        );
    }

    const onSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (send === "sending") return;
        if (!emailLooksRight(email)) {
            setBadEmail(true);
            return;
        }
        setBadEmail(false);
        setSend("sending");
        const sent = token.current;
        token.current = null;
        const result = await sendTellMeWhen(site.apiUrl, email, sent);
        if (sent) setRound((r) => r + 1);
        if (result === "sent") {
            setSend("idle");
            setAsked(true);
        } else if (result === "email") {
            setSend("idle");
            setBadEmail(true);
        } else {
            setSend(result === "check" ? "check" : "failed");
        }
    };

    return (
        <form noValidate onSubmit={onSubmit} className="grid w-full gap-3">
            <Field
                id={`${id}-email`}
                name="email"
                type="email"
                autoComplete="email"
                label={copy.label}
                value={email}
                maxLength={320}
                aria-required
                error={badEmail ? copy.invalid : undefined}
                onChange={(e) => {
                    setEmail(e.target.value);
                    if (send !== "sending") setSend("idle");
                }}
            />
            {site.turnstileSiteKey ? (
                <ChallengeWidget
                    key={round}
                    siteKey={site.turnstileSiteKey}
                    onToken={(t) => {
                        token.current = t;
                    }}
                />
            ) : null}
            {send === "failed" || send === "check" ? (
                <p
                    role="alert"
                    className="m-0 text-[14px] font-semibold text-destructive"
                >
                    {send === "check" ? copy.check : copy.failed}
                </p>
            ) : null}
            <div>
                <Button type="submit" size="sm" disabled={send === "sending"}>
                    {copy.ask}
                </Button>
            </div>
        </form>
    );
}
