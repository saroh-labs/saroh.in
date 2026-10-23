"use client";

import { Field } from "@saroh/ui/field";
import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import { useId } from "react";

import type { TurnOnDraft } from "@/lib/modules/turn-on";
import { tidyAddress } from "@/lib/modules/turn-on";
import type { FieldErrors } from "@/lib/modules/turn-on-errors";
import type {
    Fulfilment,
    WebsiteTemplateChoice,
} from "@/lib/modules/turn-on-schema";
import { usesLine } from "@/lib/sites/template-picker";

import { CheckRow } from "@/components/shared/fields/check-row";
import { RadioCards } from "@/components/shared/fields/choice-group";
import { TextLink } from "@saroh/ui/text-link";

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
                htmlFor={`${id}-name`}
                label="Location name"
                error={errors.storefrontName}
                hint="Where you sell in person. Your business name, unless you'd call it something else."
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
                    <CheckRow
                        key={o.value}
                        checked={c.fulfilment.includes(o.value)}
                        onChange={(on) => flip(o.value, on)}
                        boxClassName="mt-0.5"
                        className="items-start gap-2.5 rounded-[9px] border border-border px-3 py-2.5 transition-colors duration-fast hover:bg-muted/60 active:bg-accent-active has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
                    >
                        <span className="min-w-0">
                            <span className="block text-[13px] font-medium">
                                {o.label}
                            </span>
                            <span className="block text-[11.5px] text-muted-foreground">
                                {o.note}
                            </span>
                        </span>
                    </CheckRow>
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
                    <p className="text-pretty rounded-[9px] bg-muted px-3 py-2 text-[12px] leading-normal text-foreground">
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
    addressFixed = false,
}: {
    draft: TurnOnDraft;
    update: Update;
    errors: FieldErrors;
    /**
     * The web address was chosen at setup and the API offered it back: it
     * is a line to read, not a field. False once the API refuses it.
     */
    addressFixed?: boolean;
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
            <Field
                htmlFor={`${id}-name`}
                label="Site name"
                error={errors.siteName}
            >
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
                />
            </Field>
            {addressFixed ? (
                // Chosen when the business was set up: said, not asked again.
                <dl className="grid gap-1">
                    <dt className="text-[12.5px] font-medium">Web address</dt>
                    <dd className="break-all font-mono text-[13px]">
                        {w.address}.saroh.app
                    </dd>
                    <dd className="text-pretty text-[11.5px] leading-normal text-muted-foreground">
                        You chose it when you set up. It can be changed in
                        Settings › Business.
                    </dd>
                </dl>
            ) : (
                <Field
                    holdsData
                    htmlFor={`${id}-address`}
                    label="Web address"
                    error={errors.address}
                    hint={
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
                            className="min-w-0 flex-1 border-0 text-right shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                        />
                        <span
                            id={`${id}-suffix`}
                            className="shrink-0 pr-3 text-[14px] text-muted-foreground"
                        >
                            .saroh.app
                        </span>
                    </div>
                </Field>
            )}
            {suggestion && suggestion !== w.address ? (
                // The one asked for is taken: the API offers a free one.
                <TextLink
                    onClick={() =>
                        update((d) => ({
                            ...d,
                            WEBSITE: { ...d.WEBSITE, address: suggestion },
                        }))
                    }
                    className="-mt-2 w-fit text-left text-[12px] coarse:min-h-11"
                >
                    Use {suggestion}.saroh.app
                </TextLink>
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
            <RadioCards
                labelledBy={`${id}-label`}
                value={value}
                onChange={onChange}
                options={choices.map((c) => ({
                    value: c.id,
                    label: c.name,
                    aside: usesLine(c),
                }))}
            />
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
    const now = draft.connect[moduleKey] ?? true;
    const set = (value: boolean) =>
        update((d) => ({
            ...d,
            connect: { ...d.connect, [moduleKey]: value },
        }));
    const what = moduleKey === "PAYMENTS" ? "Razorpay or Cashfree" : "email";
    return (
        <RadioCards
            label="Connect a provider"
            value={now ? "now" : "later"}
            onChange={(v) => set(v === "now")}
            options={[
                { value: "now", label: `Connect ${what} now` },
                { value: "later", label: "Later" },
            ]}
        />
    );
}
