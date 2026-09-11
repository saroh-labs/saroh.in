"use client";

import { Input } from "@saroh/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@saroh/ui/select";

import type {
    CtaAction,
    CtaKind,
    CtaValue,
    SitePage,
} from "@/lib/sites/service";

import { Field } from "./field";

/**
 * Read a button's action, lifting a v1 `href` on the way (#207).
 *
 * A v1 button had only an address. Read as `{ kind: "url", href }` it is the
 * same button with its intent named, and saving it back writes v2 — which is
 * why the callers below bump `contractVersion` when they write an action. A
 * button is never rewritten just by being looked at: the lift is applied on
 * the first EDIT, so an untouched v1 section stays exactly as it was.
 */
export function actionOf(cta: CtaValue | undefined): CtaAction {
    if (cta?.action) return cta.action;
    return { kind: "url", href: cta?.href ?? "" };
}

const CTA_KINDS: { value: CtaKind; label: string }[] = [
    { value: "page", label: "Open a page on this site" },
    { value: "url", label: "Open a web address" },
    { value: "call", label: "Call a phone number" },
    { value: "whatsapp", label: "Message on WhatsApp" },
    { value: "email", label: "Send an email" },
];

/** A blank action of the given kind, for when the merchant switches kinds. */
export function blankAction(
    kind: CtaKind,
    homePageId: string | undefined,
): CtaAction {
    switch (kind) {
        case "page":
            return { kind, pageId: homePageId ?? "" };
        case "url":
            return { kind, href: "" };
        case "call":
            return { kind, number: "" };
        case "whatsapp":
            return { kind, number: "" };
        case "email":
            return { kind, address: "" };
    }
}

/**
 * What a button does, and the one thing that kind needs (#207).
 *
 * Choosing the action changes what is asked for. A page is PICKED from the
 * site's pages rather than typed as a path — that is what turns "points at a
 * page that is not on this site" from a warning into something that cannot
 * be authored. A phone number is typed as people type them; the publisher
 * normalises it.
 */
export function CtaActionFields({
    action,
    pages,
    onChange,
}: {
    action: CtaAction;
    pages: SitePage[];
    onChange: (next: CtaAction) => void;
}) {
    const home = pages.find((p) => p.isHome)?.id;
    return (
        <>
            <Field label="When pressed">
                <Select
                    value={action.kind}
                    onValueChange={(v) =>
                        onChange(blankAction(v as CtaKind, home))
                    }
                >
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {CTA_KINDS.map((k) => (
                            <SelectItem key={k.value} value={k.value}>
                                {k.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </Field>
            {action.kind === "page" ? (
                <Field label="Page">
                    <Select
                        value={action.pageId}
                        onValueChange={(v) =>
                            onChange({ kind: "page", pageId: v })
                        }
                    >
                        <SelectTrigger>
                            <SelectValue placeholder="Choose a page" />
                        </SelectTrigger>
                        <SelectContent>
                            {pages
                                .filter((p) => !p.hidden)
                                .map((p) => (
                                    <SelectItem key={p.id} value={p.id}>
                                        {p.title}
                                        <span className="ml-2 font-mono text-[0.6875rem] text-muted-foreground">
                                            {p.path}
                                        </span>
                                    </SelectItem>
                                ))}
                        </SelectContent>
                    </Select>
                </Field>
            ) : null}
            {action.kind === "url" ? (
                <Field label="Address">
                    <Input
                        value={action.href}
                        onChange={(e) =>
                            onChange({ kind: "url", href: e.target.value })
                        }
                        placeholder="https://…"
                        inputMode="url"
                    />
                </Field>
            ) : null}
            {action.kind === "call" || action.kind === "whatsapp" ? (
                <Field label="Phone number">
                    <Input
                        value={action.number}
                        onChange={(e) =>
                            onChange({ ...action, number: e.target.value })
                        }
                        placeholder="+91 98450 12345"
                        inputMode="tel"
                    />
                </Field>
            ) : null}
            {action.kind === "whatsapp" ? (
                <Field label="Message to start with">
                    <Input
                        value={action.message ?? ""}
                        onChange={(e) =>
                            onChange({
                                ...action,
                                message: e.target.value || undefined,
                            })
                        }
                        placeholder="Hi, I'd like to ask about…"
                    />
                </Field>
            ) : null}
            {action.kind === "email" ? (
                <>
                    <Field label="Email address">
                        <Input
                            value={action.address}
                            onChange={(e) =>
                                onChange({ ...action, address: e.target.value })
                            }
                            placeholder="hello@example.in"
                            inputMode="email"
                        />
                    </Field>
                    <Field label="Subject">
                        <Input
                            value={action.subject ?? ""}
                            onChange={(e) =>
                                onChange({
                                    ...action,
                                    subject: e.target.value || undefined,
                                })
                            }
                            placeholder="Optional"
                        />
                    </Field>
                </>
            ) : null}
        </>
    );
}
