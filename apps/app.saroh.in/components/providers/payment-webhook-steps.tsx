"use client";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { showError, showSuccess } from "@saroh/ui/toast";
import { Copy, RefreshCw } from "lucide-react";
import { useId, useState } from "react";

import { providerName } from "@/lib/payments/providers";
import type {
    PaymentProviderName,
    PaymentWebhookSetup,
} from "@/lib/providers/service";
import { generateWebhookSecret, WEBHOOK_PLACE } from "@/lib/providers/webhook";

/*
 * The payment setup dialog's webhook steps (DEC-063): tell the provider
 * where to send payment updates, and — for Razorpay — the signing secret
 * both sides share. Without them a customer can pay and the order never
 * hears about it.
 */

/** Copy text, and say so either way. */
function copy(text: string, done: string) {
    void navigator.clipboard.writeText(text).then(
        () => showSuccess(done),
        () => showError("Could not copy — select it instead."),
    );
}

/** A numbered step's heading: "2  Tell Razorpay where…". */
export function StepHeading({
    n,
    id,
    children,
}: {
    n: number;
    id: string;
    children: React.ReactNode;
}) {
    return (
        <h3
            id={id}
            className="flex items-center gap-2 text-[13.5px] font-semibold"
        >
            <span
                aria-hidden
                className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-foreground"
            >
                {n}
            </span>
            {children}
        </h3>
    );
}

/**
 * Step 2: the address to add in the provider's dashboard, the events to
 * tick, and where it is. The address is the API's (`setup`); when it
 * couldn't be read, the step says so rather than show a guess.
 */
export function WebhookAddressStep({
    n,
    provider,
    setup,
    testMode,
}: {
    n: number;
    provider: PaymentProviderName;
    setup: PaymentWebhookSetup | null;
    testMode: boolean;
}) {
    const name = providerName(provider);
    const headingId = useId();
    const urlId = useId();
    const url = setup?.url ?? null;
    return (
        <section aria-labelledby={headingId} className="grid gap-2.5">
            <StepHeading n={n} id={headingId}>
                Tell {name} where to send payment updates
            </StepHeading>
            <p className="text-pretty text-[12.5px] leading-[1.45] text-muted-foreground">
                In {name}, open{" "}
                <span className="font-medium text-foreground">
                    {WEBHOOK_PLACE[provider]}
                </span>
                . Paste this address, tick the events below and save.
            </p>
            {testMode ? (
                <p className="rounded-[10px] bg-highlight-subtle px-3 py-2 text-[12px] leading-[1.45] text-highlight-subtle-foreground">
                    Test mode — use {name}&apos;s test dashboard for the webhook
                    too.
                </p>
            ) : null}
            {setup && url ? (
                <>
                    <div className="grid gap-1.5">
                        <Label htmlFor={urlId}>Webhook URL</Label>
                        <div className="flex min-w-0 items-center gap-1.5">
                            <Input
                                id={urlId}
                                readOnly
                                value={url}
                                className="min-w-0 flex-1 font-mono text-[12px]"
                                onFocus={(e) => e.currentTarget.select()}
                            />
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="shrink-0 cursor-pointer"
                                aria-label="Copy webhook URL"
                                onClick={() => copy(url, "Webhook URL copied")}
                            >
                                <Copy aria-hidden className="size-4" />
                                Copy
                            </Button>
                        </div>
                    </div>
                    <div className="grid gap-1.5">
                        <p className="text-[12.5px] font-medium">
                            Tick these events
                        </p>
                        <ul
                            aria-label="Events to tick"
                            className="flex flex-wrap gap-1.5"
                        >
                            {setup.events.map((event) => (
                                <li key={event}>
                                    <code className="select-all rounded-md bg-muted px-[7px] py-0.5 font-mono text-[12px] text-foreground">
                                        {event}
                                    </code>
                                </li>
                            ))}
                        </ul>
                        {/* Only Razorpay takes autopay; Cashfree has none (#824). */}
                        {provider === "RAZORPAY" ? (
                            <p className="text-[11.5px] leading-[1.45] text-muted-foreground">
                                Autopay adds its own events when it is switched
                                on.
                            </p>
                        ) : null}
                    </div>
                </>
            ) : (
                <p className="rounded-[10px] border border-dashed border-border-strong px-3 py-2.5 text-[12.5px] leading-[1.45] text-muted-foreground">
                    {setup
                        ? `Saroh hasn't set the address ${name} should send payment updates to yet, so it can't be shown. Contact Saroh support before connecting — ${name} needs it to confirm payments.`
                        : `The webhook address couldn't be loaded. Reload the page to see it — ${name} still needs it to confirm payments.`}
                </p>
            )}
        </section>
    );
}

/**
 * Step 3, Razorpay only: the webhook signing secret, required. "Generate
 * one" makes a strong one in the browser to paste into Razorpay too; it is
 * shown once made so it can be copied, and leaves the browser only in the
 * connect call.
 */
export function WebhookSecretStep({
    n,
    provider,
    value,
    onChange,
}: {
    n: number;
    provider: PaymentProviderName;
    value: string;
    onChange: (value: string) => void;
}) {
    const name = providerName(provider);
    const headingId = useId();
    const fieldId = useId();
    const hintId = useId();
    // Shown once generated, so it can be read and copied into the provider.
    const [shown, setShown] = useState(false);
    return (
        <section aria-labelledby={headingId} className="grid gap-2.5">
            <StepHeading n={n} id={headingId}>
                Webhook signing secret
            </StepHeading>
            <div className="grid gap-1.5">
                <Label htmlFor={fieldId}>Webhook signing secret</Label>
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <Input
                        id={fieldId}
                        type={shown ? "text" : "password"}
                        autoComplete="off"
                        spellCheck={false}
                        required
                        aria-required
                        aria-describedby={hintId}
                        value={value}
                        className="min-w-0 flex-[1_1_180px] font-mono text-[12.5px]"
                        onChange={(e) => onChange(e.target.value)}
                    />
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="cursor-pointer"
                        aria-label="Generate a webhook signing secret"
                        onClick={() => {
                            onChange(generateWebhookSecret());
                            setShown(true);
                        }}
                    >
                        <RefreshCw aria-hidden className="size-4" />
                        Generate one
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="cursor-pointer"
                        aria-label="Copy webhook signing secret"
                        disabled={!value.trim()}
                        onClick={() =>
                            copy(value.trim(), "Webhook secret copied")
                        }
                    >
                        <Copy aria-hidden className="size-4" />
                        Copy
                    </Button>
                </div>
                <p
                    id={hintId}
                    className="text-pretty text-[11.5px] leading-[1.45] text-muted-foreground"
                >
                    Use the same secret here and in {name}: type the one you set
                    there, or generate one and paste it into {name}&apos;s
                    webhook form. It lets Saroh check that each payment update
                    really came from {name}.
                </p>
            </div>
        </section>
    );
}
