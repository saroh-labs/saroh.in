"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@saroh/ui/dialog";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { cn } from "@saroh/ui/lib/utils";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { OptionSelect } from "@/components/shared/option-select";
import {
    connectCommsProvider,
    connectPaymentProvider,
    disconnectCommsProvider,
    disconnectPaymentProvider,
} from "@/lib/providers/actions";
import type {
    CommsChannel,
    ConnectedCommsProvider,
    ConnectedPaymentProvider,
    PaymentProviderName,
} from "@/lib/providers/service";

const PAYMENT_PROVIDERS: { value: PaymentProviderName; label: string }[] = [
    { value: "RAZORPAY", label: "Razorpay" },
    { value: "CASHFREE", label: "Cashfree" },
];

/** What each channel's adapter supports, and the secrets it reads. */
const CHANNELS: Record<
    CommsChannel,
    {
        label: string;
        providers: { value: string; label: string }[];
        fields: {
            key: string;
            label: string;
            secret?: boolean;
            optional?: boolean;
            hint?: string;
        }[];
        fromLabel: string;
    }
> = {
    EMAIL: {
        label: "Email",
        providers: [
            { value: "RESEND", label: "Resend" },
            { value: "SENDGRID", label: "SendGrid" },
            { value: "SMTP", label: "SMTP relay" },
        ],
        fields: [
            { key: "apiKey", label: "API key", secret: true },
            {
                key: "baseUrl",
                label: "Relay address",
                optional: true,
                hint: "Only for a self-hosted or regional relay. Leave empty for the provider's own.",
            },
        ],
        fromLabel: "Send from",
    },
    WHATSAPP: {
        label: "WhatsApp",
        providers: [
            { value: "META", label: "Meta (WhatsApp Cloud)" },
            { value: "TWILIO", label: "Twilio" },
        ],
        fields: [
            { key: "accessToken", label: "Access token", secret: true },
            { key: "phoneNumberId", label: "Phone number ID" },
        ],
        fromLabel: "Sending number",
    },
};

const labelOfPayment = (p: string) =>
    PAYMENT_PROVIDERS.find((x) => x.value === p)?.label ?? p;
const labelOfComms = (channel: CommsChannel, p: string) =>
    CHANNELS[channel].providers.find((x) => x.value === p)?.label ?? p;

/**
 * Connect, replace or disconnect the business's payment or messaging
 * provider — the Providers page's "Set up" / "Manage", which used to link to
 * the page it was already on.
 *
 * Keys go in and never come back out: the API seals them, so replacing one
 * means typing it again, and the dialog says so. Disconnecting is confirmed
 * rather than undone for the same reason — undoing it would need the secret
 * nobody can read back.
 */
export function ProviderSetupDialog(
    props:
        | {
              kind: "payments";
              label: string;
              trigger: string;
              urgent: boolean;
              connected: ConnectedPaymentProvider[];
          }
        | {
              kind: "messaging";
              label: string;
              trigger: string;
              urgent: boolean;
              /** The channel the dialog opens on (Email by default). */
              channel?: CommsChannel;
              connected: ConnectedCommsProvider[];
          },
) {
    const [open, setOpen] = useState(false);
    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button
                    size="sm"
                    variant={props.urgent ? "brand" : "outline"}
                    aria-label={`${props.trigger} ${props.label}`}
                >
                    {props.trigger}
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-[480px]">
                {props.kind === "payments" ? (
                    <PaymentsForm
                        connected={props.connected}
                        onDone={() => setOpen(false)}
                    />
                ) : (
                    <MessagingForm
                        initialChannel={props.channel ?? "EMAIL"}
                        connected={props.connected}
                        onDone={() => setOpen(false)}
                    />
                )}
            </DialogContent>
        </Dialog>
    );
}

function PaymentsForm({
    connected,
    onDone,
}: {
    connected: ConnectedPaymentProvider[];
    onDone: () => void;
}) {
    const router = useRouter();
    const current = connected.find((c) => c.status === "CONNECTED");
    const [provider, setProvider] = useState<PaymentProviderName>(
        current?.provider ?? "RAZORPAY",
    );
    const [keyId, setKeyId] = useState("");
    const [keySecret, setKeySecret] = useState("");
    const [publicKey, setPublicKey] = useState(current?.publicKey ?? "");
    const [webhookSecret, setWebhookSecret] = useState("");
    const [saving, setSaving] = useState(false);
    const [confirming, setConfirming] = useState<PaymentProviderName | null>(
        null,
    );
    const ids = {
        provider: useId(),
        keyId: useId(),
        secret: useId(),
        public: useId(),
        hook: useId(),
    };

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        setSaving(true);
        const res = await connectPaymentProvider({
            provider,
            keyId: keyId.trim(),
            keySecret: keySecret.trim(),
            ...(publicKey.trim() ? { publicKey: publicKey.trim() } : {}),
            ...(webhookSecret.trim()
                ? { webhookSecret: webhookSecret.trim() }
                : {}),
        });
        setSaving(false);
        if (!res.ok) return showError(res.error);
        showSuccess(`${labelOfPayment(provider)} connected`);
        onDone();
        router.refresh();
    }

    async function disconnect(p: PaymentProviderName) {
        const res = await disconnectPaymentProvider(p);
        if (!res.ok) return showError(res.error);
        showSuccess(`${labelOfPayment(p)} disconnected`);
        onDone();
        router.refresh();
    }

    return (
        <form onSubmit={(e) => void submit(e)} className="space-y-4">
            <DialogHeader>
                <DialogTitle className="font-display text-[19px] tracking-[-0.025em]">
                    Payments
                </DialogTitle>
                <DialogDescription>
                    Where card and UPI payments are taken. Your keys are sealed
                    when saved and are never shown again, here or anywhere.
                </DialogDescription>
            </DialogHeader>

            <Connected
                rows={connected.map((c) => ({
                    key: c.provider,
                    name: labelOfPayment(c.provider),
                    detail: c.publicKey,
                    status: c.status,
                }))}
                onDisconnect={(key) =>
                    setConfirming(key as PaymentProviderName)
                }
            />

            <div className="grid gap-1.5">
                <Label htmlFor={ids.provider}>
                    {current ? "Replace with" : "Provider"}
                </Label>
                <OptionSelect
                    id={ids.provider}
                    value={provider}
                    onValueChange={setProvider}
                    options={PAYMENT_PROVIDERS}
                />
            </div>
            <div className="grid grid-cols-2 gap-3">
                <SecretField
                    id={ids.keyId}
                    label="Key ID"
                    value={keyId}
                    onChange={setKeyId}
                />
                <SecretField
                    id={ids.secret}
                    label="Key secret"
                    value={keySecret}
                    onChange={setKeySecret}
                    secret
                />
            </div>
            <SecretField
                id={ids.public}
                label="Public key"
                value={publicKey}
                onChange={setPublicKey}
                optional
                hint="Shown to the checkout; not a secret."
            />
            <SecretField
                id={ids.hook}
                label="Webhook signing secret"
                value={webhookSecret}
                onChange={setWebhookSecret}
                secret
                optional
                hint="Lets Saroh check that payment updates really came from the provider."
            />

            <DialogFooter className="gap-2 sm:gap-0">
                <Button type="button" variant="outline" onClick={onDone}>
                    Cancel
                </Button>
                <Button
                    type="submit"
                    disabled={saving || !keyId.trim() || !keySecret.trim()}
                >
                    {saving
                        ? "Connecting…"
                        : current
                          ? "Save keys"
                          : `Connect ${labelOfPayment(provider)}`}
                </Button>
            </DialogFooter>

            {confirming ? (
                <ConfirmDialog
                    open
                    onOpenChange={(o) => {
                        if (!o) setConfirming(null);
                    }}
                    title={`Disconnect ${labelOfPayment(confirming)}?`}
                    description="Checkout stops taking card and UPI payments through it straight away. Orders already paid are not affected. Connecting again means entering the keys again — they cannot be read back."
                    confirmLabel="Disconnect"
                    onConfirm={() => void disconnect(confirming)}
                />
            ) : null}
        </form>
    );
}

function MessagingForm({
    initialChannel,
    connected,
    onDone,
}: {
    initialChannel: CommsChannel;
    connected: ConnectedCommsProvider[];
    onDone: () => void;
}) {
    const router = useRouter();
    const [channel, setChannel] = useState<CommsChannel>(initialChannel);
    const spec = CHANNELS[channel];
    const current = connected.find(
        (c) => c.channel === channel && c.status === "CONNECTED",
    );
    const [provider, setProvider] = useState(
        current?.provider ?? spec.providers[0].value,
    );
    const [values, setValues] = useState<Record<string, string>>({});
    const [fromAddress, setFromAddress] = useState(current?.fromAddress ?? "");
    const [saving, setSaving] = useState(false);
    const [confirming, setConfirming] = useState<CommsChannel | null>(null);
    const fromId = useId();
    const providerId = useId();
    const fieldIds = useId();

    function pickChannel(next: CommsChannel) {
        const now = connected.find(
            (c) => c.channel === next && c.status === "CONNECTED",
        );
        setChannel(next);
        setProvider(now?.provider ?? CHANNELS[next].providers[0].value);
        setFromAddress(now?.fromAddress ?? "");
        setValues({});
    }

    const missing = spec.fields.some(
        (f) => !f.optional && !(values[f.key] ?? "").trim(),
    );

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        setSaving(true);
        const credentials: Record<string, string> = {};
        for (const f of spec.fields) {
            const v = (values[f.key] ?? "").trim();
            if (v) credentials[f.key] = v;
        }
        const res = await connectCommsProvider({
            channel,
            provider,
            credentials,
            ...(fromAddress.trim() ? { fromAddress: fromAddress.trim() } : {}),
        });
        setSaving(false);
        if (!res.ok) return showError(res.error);
        showSuccess(
            `${spec.label} is sent through ${labelOfComms(channel, provider)}`,
        );
        onDone();
        router.refresh();
    }

    async function disconnect(c: CommsChannel) {
        const res = await disconnectCommsProvider(c);
        if (!res.ok) return showError(res.error);
        showSuccess(`${CHANNELS[c].label} disconnected`);
        onDone();
        router.refresh();
    }

    return (
        <form onSubmit={(e) => void submit(e)} className="space-y-4">
            <DialogHeader>
                <DialogTitle className="font-display text-[19px] tracking-[-0.025em]">
                    Messaging
                </DialogTitle>
                <DialogDescription>
                    How messages to your customers and leads are sent. Keys are
                    sealed when saved and never shown again.
                </DialogDescription>
            </DialogHeader>

            <div
                role="radiogroup"
                aria-label="Channel"
                className="grid grid-cols-2 gap-[5px]"
            >
                {(Object.keys(CHANNELS) as CommsChannel[]).map((key) => (
                    <label
                        key={key}
                        className={cn(
                            "flex cursor-pointer items-center justify-center gap-2 rounded-[9px] border px-3 py-2 text-[13px] transition-colors duration-fast has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                            channel === key
                                ? "border-border-strong bg-foreground/[0.03] font-semibold"
                                : "border-muted font-medium hover:border-border-strong",
                        )}
                    >
                        <input
                            type="radio"
                            name="comms-channel"
                            className="sr-only"
                            checked={channel === key}
                            onChange={() => pickChannel(key)}
                        />
                        {CHANNELS[key].label}
                    </label>
                ))}
            </div>

            <Connected
                rows={connected
                    .filter((c) => c.channel === channel)
                    .map((c) => ({
                        key: c.channel,
                        name: labelOfComms(c.channel, c.provider),
                        detail: c.fromAddress,
                        status: c.status,
                    }))}
                onDisconnect={(key) => setConfirming(key as CommsChannel)}
            />

            <div className="grid gap-1.5">
                <Label htmlFor={providerId}>
                    {current ? "Replace with" : "Provider"}
                </Label>
                <OptionSelect
                    id={providerId}
                    value={provider}
                    onValueChange={setProvider}
                    options={spec.providers}
                />
            </div>
            {spec.fields.map((f, i) => (
                <SecretField
                    key={`${channel}-${f.key}`}
                    id={`${fieldIds}-${i}`}
                    label={f.label}
                    value={values[f.key] ?? ""}
                    onChange={(v) => setValues((x) => ({ ...x, [f.key]: v }))}
                    secret={f.secret}
                    optional={f.optional}
                    hint={f.hint}
                />
            ))}
            <SecretField
                id={fromId}
                label={spec.fromLabel}
                value={fromAddress}
                onChange={setFromAddress}
                optional
                hint="What recipients see it come from. Not a secret."
            />

            <DialogFooter className="gap-2 sm:gap-0">
                <Button type="button" variant="outline" onClick={onDone}>
                    Cancel
                </Button>
                <Button type="submit" disabled={saving || missing}>
                    {saving
                        ? "Connecting…"
                        : current
                          ? "Save keys"
                          : `Connect ${spec.label.toLowerCase()}`}
                </Button>
            </DialogFooter>

            {confirming ? (
                <ConfirmDialog
                    open
                    onOpenChange={(o) => {
                        if (!o) setConfirming(null);
                    }}
                    title={`Disconnect ${CHANNELS[confirming].label.toLowerCase()}?`}
                    description="Messages on this channel stop being sent straight away; ones already sent are not affected. Connecting again means entering the keys again — they cannot be read back."
                    confirmLabel="Disconnect"
                    onConfirm={() => void disconnect(confirming)}
                />
            ) : null}
        </form>
    );
}

/** What is connected now, with the way to take it away. */
function Connected({
    rows,
    onDisconnect,
}: {
    rows: {
        key: string;
        name: string;
        detail: string | null;
        status: string;
    }[];
    onDisconnect: (key: string) => void;
}) {
    if (rows.length === 0) {
        return (
            <p className="rounded-[10px] border border-dashed border-border-strong px-3.5 py-3 text-[12.5px] text-muted-foreground">
                Nothing is connected yet.
            </p>
        );
    }
    return (
        <ul className="overflow-hidden rounded-[10px] border border-border">
            {rows.map((r) => (
                <li
                    key={r.key}
                    className="flex items-center gap-3 border-b border-border px-3.5 py-2.5 last:border-b-0"
                >
                    <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-medium">
                            {r.name}
                        </span>
                        {r.detail ? (
                            <span className="block truncate font-mono text-[11.5px] text-muted-foreground">
                                {r.detail}
                            </span>
                        ) : null}
                    </span>
                    <Badge
                        variant={
                            r.status === "CONNECTED" ? "success" : "neutral"
                        }
                    >
                        {r.status === "CONNECTED" ? "Connected" : "Off"}
                    </Badge>
                    {r.status === "CONNECTED" ? (
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => onDisconnect(r.key)}
                        >
                            Disconnect
                        </Button>
                    ) : null}
                </li>
            ))}
        </ul>
    );
}

function SecretField({
    id,
    label,
    value,
    onChange,
    secret,
    optional,
    hint,
}: {
    id: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
    secret?: boolean;
    optional?: boolean;
    hint?: string;
}) {
    return (
        <div className="grid gap-1.5">
            <Label htmlFor={id}>
                {label}{" "}
                {optional ? (
                    <span className="font-normal text-muted-foreground">
                        optional
                    </span>
                ) : null}
            </Label>
            <Input
                id={id}
                type={secret ? "password" : "text"}
                autoComplete="off"
                spellCheck={false}
                value={value}
                className="font-mono text-[12.5px]"
                onChange={(e) => onChange(e.target.value)}
            />
            {hint ? (
                <p className="text-[11.5px] leading-[1.45] text-muted-foreground">
                    {hint}
                </p>
            ) : null}
        </div>
    );
}
