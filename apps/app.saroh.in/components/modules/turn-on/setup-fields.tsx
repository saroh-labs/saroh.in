"use client";

import { Checkbox } from "@saroh/ui/checkbox";
import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import { RadioGroup, RadioGroupItem } from "@saroh/ui/radio-group";
import { useId } from "react";

import type { TurnOnDraft } from "@/lib/modules/turn-on";
import { tidyAddress } from "@/lib/modules/turn-on";
import type { FieldErrors } from "@/lib/modules/turn-on-errors";
import type {
    Fulfilment,
    WebsiteTemplateChoice,
} from "@/lib/modules/turn-on-schema";
import { usesLine } from "@/lib/sites/template-picker";

import { Field, INPUT } from "./field";

export type Update = (change: (draft: TurnOnDraft) => TurnOnDraft) => void;

const HOW_ORDERS_LEAVE: readonly {
    value: Fulfilment;
    label: string;
    note: string;
}[] = [
    {
        value: "PICKUP",
        label: "Pick-up",
        note: "They collect it from you.",
    },
    {
        value: "LOCAL_DELIVERY",
        label: "Delivery",
        note: "You take it to them, nearby.",
    },
    {
        value: "SHIPPING",
        label: "Shipping",
        note: "A courier takes it anywhere.",
    },
];

/**
 * Sell's minimum (DEC-068, worded as DEC-069): the location's name and how
 * orders leave. Delivery or shipping is selling online, and the online
 * shop goes on the website, which is made with it when it is off.
 */
export function SellFields({
    draft,
    update,
    errors,
    shopNote,
}: {
    draft: TurnOnDraft;
    update: Update;
    errors: FieldErrors;
    /** What selling online does with the website; null when it says nothing. */
    shopNote: string | null;
}) {
    const id = useId();
    const c = draft.COMMERCE;
    const flip = (value: Fulfilment, on: boolean) =>
        update((d) => ({
            ...d,
            COMMERCE: {
                ...d.COMMERCE,
                fulfilment: on
                    ? [...d.COMMERCE.fulfilment, value]
                    : d.COMMERCE.fulfilment.filter((f) => f !== value),
            },
        }));
    const howError = Object.entries(errors).find(([p]) =>
        p.startsWith("fulfilment"),
    )?.[1];
    return (
        <>
            <Field
                id={`${id}-name`}
                label="Location name"
                error={errors.storefrontName}
                note="Where you sell in person. Your business name, unless you'd call it something else."
            >
                <Input
                    id={`${id}-name`}
                    value={c.storefrontName}
                    maxLength={120}
                    autoComplete="off"
                    aria-invalid={errors.storefrontName ? true : undefined}
                    aria-describedby={`${id}-name-note`}
                    onChange={(e) =>
                        update((d) => ({
                            ...d,
                            COMMERCE: {
                                ...d.COMMERCE,
                                storefrontName: e.target.value,
                            },
                        }))
                    }
                    className={INPUT}
                />
            </Field>
            <fieldset
                className="grid min-w-0 gap-2"
                aria-describedby={howError ? `${id}-how-note` : undefined}
            >
                <legend className="mb-1.5 text-[12.5px] font-medium">
                    How orders leave
                </legend>
                {HOW_ORDERS_LEAVE.map((o) => (
                    <label
                        key={o.value}
                        className="flex cursor-pointer items-start gap-2.5 rounded-[9px] border border-border px-3 py-2.5 transition-colors duration-fast hover:bg-muted/60 active:bg-accent-active has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring coarse:min-h-11"
                    >
                        <Checkbox
                            checked={c.fulfilment.includes(o.value)}
                            onCheckedChange={(v) => flip(o.value, v === true)}
                            className="mt-0.5"
                        />
                        <span className="min-w-0">
                            <span className="block text-[13px] font-medium">
                                {o.label}
                            </span>
                            <span className="block text-[11.5px] text-muted-foreground">
                                {o.note}
                            </span>
                        </span>
                    </label>
                ))}
                {howError ? (
                    <span
                        id={`${id}-how-note`}
                        className="text-[11.5px] text-destructive-subtle-foreground"
                    >
                        {howError}
                    </span>
                ) : null}
                {shopNote ? (
                    <p className="text-pretty rounded-[9px] bg-brand-subtle px-3 py-2 text-[12px] leading-normal text-brand-subtle-foreground">
                        {shopNote}
                    </p>
                ) : null}
            </fieldset>
        </>
    );
}

/**
 * Website's minimum: the site's name and its address, with the
 * `.saroh.app` it lives on shown beside what is typed. An address that is
 * taken or reserved comes back from the API on the field. Below them, the
 * template the new site starts from, which follows what is being set up
 * (DEC-070, K15): said, and when other templates suit the business (U12),
 * a short choice of them, the kind's picked to start with.
 */
export function WebsiteFields({
    draft,
    update,
    errors,
    suggestion = null,
    template = null,
    choices = [],
}: {
    draft: TurnOnDraft;
    update: Update;
    errors: FieldErrors;
    /** A free address the API offered for a taken one (DEC-069). */
    suggestion?: string | null;
    /** The template a new site starts from; null says nothing. */
    template?: { id: string; name: string } | null;
    /** The templates suggested for the business, the kind's first. */
    choices?: readonly WebsiteTemplateChoice[];
}) {
    const id = useId();
    const w = draft.WEBSITE;
    return (
        <>
            <Field id={`${id}-name`} label="Site name" error={errors.siteName}>
                <Input
                    id={`${id}-name`}
                    value={w.siteName}
                    maxLength={120}
                    autoComplete="off"
                    aria-invalid={errors.siteName ? true : undefined}
                    aria-describedby={
                        errors.siteName ? `${id}-name-note` : undefined
                    }
                    onChange={(e) =>
                        update((d) => ({
                            ...d,
                            WEBSITE: { ...d.WEBSITE, siteName: e.target.value },
                        }))
                    }
                    className={INPUT}
                />
            </Field>
            <Field
                id={`${id}-address`}
                label="Web address"
                error={errors.address}
                note={
                    w.address
                        ? `Customers find you at ${w.address}.saroh.app`
                        : "Letters, numbers and hyphens."
                }
            >
                <div
                    className={cn(
                        "flex min-w-0 items-center rounded-[9px] border border-input bg-background focus-within:ring-2 focus-within:ring-ring",
                        errors.address && "border-destructive",
                    )}
                >
                    <Input
                        id={`${id}-address`}
                        value={w.address}
                        maxLength={57}
                        autoComplete="off"
                        spellCheck={false}
                        inputMode="url"
                        aria-invalid={errors.address ? true : undefined}
                        aria-describedby={`${id}-address-note ${id}-suffix`}
                        onChange={(e) =>
                            update((d) => ({
                                ...d,
                                WEBSITE: {
                                    ...d.WEBSITE,
                                    address: tidyAddress(e.target.value),
                                },
                            }))
                        }
                        className={cn(
                            INPUT,
                            "min-w-0 flex-1 border-0 text-right shadow-none focus-visible:ring-0 focus-visible:ring-offset-0",
                        )}
                    />
                    <span
                        id={`${id}-suffix`}
                        className="shrink-0 pr-3 text-[14px] text-muted-foreground"
                    >
                        .saroh.app
                    </span>
                </div>
            </Field>
            {suggestion && suggestion !== w.address ? (
                // The one asked for is taken: the API offers a free one.
                <button
                    type="button"
                    onClick={() =>
                        update((d) => ({
                            ...d,
                            WEBSITE: { ...d.WEBSITE, address: suggestion },
                        }))
                    }
                    className="-mt-2 w-fit cursor-pointer rounded-sm text-left text-[12px] font-medium text-foreground underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:text-muted-foreground coarse:min-h-11"
                >
                    Use {suggestion}.saroh.app
                </button>
            ) : null}
            {template && choices.length > 1 ? (
                <TemplateChoice
                    choices={choices}
                    value={w.templateId ?? template.id}
                    onChange={(templateId) =>
                        update((d) => ({
                            ...d,
                            WEBSITE: { ...d.WEBSITE, templateId },
                        }))
                    }
                />
            ) : template ? (
                <p className="text-[12.5px] leading-normal text-muted-foreground">
                    Starts from the {template.name} template. Change its pages
                    any time.
                </p>
            ) : null}
        </>
    );
}

/**
 * Which template the new site starts from (U12): the few suggested for the
 * business, each with what it uses. The rest are a site's to change later,
 * page by page.
 */
function TemplateChoice({
    choices,
    value,
    onChange,
}: {
    choices: readonly WebsiteTemplateChoice[];
    value: string;
    onChange: (id: string) => void;
}) {
    const id = useId();
    return (
        <div className="grid min-w-0 gap-2">
            <span id={`${id}-label`} className="text-[13px] font-medium">
                Starts from
            </span>
            <RadioGroup
                aria-labelledby={`${id}-label`}
                value={value}
                onValueChange={onChange}
                className="grid min-w-0 gap-2"
            >
                {choices.map((c) => {
                    const uses = usesLine(c);
                    return (
                        <label
                            key={c.id}
                            htmlFor={`${id}-${c.id}`}
                            className="flex min-w-0 cursor-pointer items-center gap-2.5 rounded-[9px] border border-border px-3 py-2 text-[13px] transition-colors duration-fast hover:bg-muted/60 active:bg-accent-active coarse:min-h-11"
                        >
                            <RadioGroupItem id={`${id}-${c.id}`} value={c.id} />
                            <span className="min-w-0 font-medium">
                                {c.name}
                            </span>
                            {uses ? (
                                <span className="ml-auto min-w-0 truncate text-[12px] text-muted-foreground">
                                    {uses}
                                </span>
                            ) : null}
                        </label>
                    );
                })}
            </RadioGroup>
            <p className="text-[12.5px] leading-normal text-muted-foreground">
                Change its pages any time.
            </p>
        </div>
    );
}

/**
 * Payments' or Communications' choice where the sheet asks for more than
 * one module: connect a provider now (Settings › Providers, once saved) or
 * later. Alone, the sheet's two buttons ask it instead.
 */
export function ConnectChoice({
    moduleKey,
    draft,
    update,
}: {
    moduleKey: string;
    draft: TurnOnDraft;
    update: Update;
}) {
    const id = useId();
    const now = draft.connect[moduleKey] ?? true;
    const set = (value: boolean) =>
        update((d) => ({
            ...d,
            connect: { ...d.connect, [moduleKey]: value },
        }));
    const what = moduleKey === "PAYMENTS" ? "Razorpay or Cashfree" : "email";
    return (
        <RadioGroup
            aria-label="Connect a provider"
            value={now ? "now" : "later"}
            onValueChange={(v) => set(v === "now")}
            className="grid min-w-0 gap-2"
        >
            {[
                { value: "now", label: `Connect ${what} now` },
                { value: "later", label: "Later" },
            ].map((o) => (
                <label
                    key={o.value}
                    htmlFor={`${id}-${o.value}`}
                    className="flex cursor-pointer items-center gap-2.5 rounded-[9px] border border-border px-3 py-2 text-[13px] transition-colors duration-fast hover:bg-muted/60 active:bg-accent-active coarse:min-h-11"
                >
                    <RadioGroupItem id={`${id}-${o.value}`} value={o.value} />
                    {o.label}
                </label>
            ))}
        </RadioGroup>
    );
}
