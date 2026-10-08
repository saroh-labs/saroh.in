"use client";

import Link from "next/link";

import { resolveVariant } from "@saroh/block-contract";
import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@saroh/ui/select";
import { Textarea } from "@saroh/ui/textarea";

import type { ServicesListContent } from "@/lib/sites/service";

import {
    CtaActionFields,
    actionOf,
    withCtaAction,
    withCtaLabel,
} from "./cta-action-fields";
import {
    DisplayOptions,
    hiddenFlag,
    unlessDefault,
    wordsOrAbsent,
} from "./display-options";
import { Field } from "./field";
import type { SectionFieldsProps } from "./props";
import { ServicesLoadNotice } from "./services-load-notice";

/** The contract's cap. */
const MAX_SERVICES = 24;

/**
 * The `servicesList` section's editor fields (#255).
 *
 * The merchant picks WHICH services and in what order. Names, prices and
 * durations are not copied in: the site reads them live, so what a visitor sees
 * follows the service editor without a republish. An archived or deleted
 * service stays in this list until removed, but the site leaves it out, and
 * the row says so.
 */
export function ServicesListFields({
    section,
    services: load,
    pages,
    onChange,
}: SectionFieldsProps<"servicesList">) {
    // Until the read is in, nothing may be called deleted or missing: an
    // unknown id means "not loaded", not "gone".
    const services = load.status === "ready" ? load.services : [];
    const c = section.content;
    const patch = (next: Partial<ServicesListContent>) =>
        onChange({ ...section, content: { ...c, ...next } });

    const byId = new Map(services.map((s) => [s.id, s]));
    const addable = services.filter(
        (s) => s.status === "ACTIVE" && !c.serviceIds.includes(s.id),
    );
    const full = c.serviceIds.length >= MAX_SERVICES;

    const move = (index: number, by: -1 | 1) => {
        const ids = [...c.serviceIds];
        ids.splice(index + by, 0, ...ids.splice(index, 1));
        patch({ serviceIds: ids });
    };

    return (
        <div className="grid gap-3">
            <Field label="Heading">
                <Input
                    value={c.heading ?? ""}
                    onChange={(e) => patch({ heading: e.target.value })}
                    placeholder="Services"
                />
            </Field>
            <Field label="Intro">
                <Textarea
                    value={c.intro ?? ""}
                    onChange={(e) => patch({ intro: e.target.value })}
                    rows={2}
                    placeholder="One line under the heading, if it needs one."
                />
            </Field>

            <Field label="Services shown">
                {load.status !== "ready" ? (
                    <div className="grid gap-2">
                        <ServicesLoadNotice load={load} />
                        {c.serviceIds.length > 0 ? (
                            <p className="text-sm text-muted-foreground">
                                {c.serviceIds.length === 1
                                    ? "1 service chosen."
                                    : `${c.serviceIds.length} services chosen.`}
                            </p>
                        ) : null}
                    </div>
                ) : services.length === 0 && c.serviceIds.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        No services yet.{" "}
                        <Link
                            href="/services/new"
                            className="underline hover:text-foreground"
                        >
                            Create a service
                        </Link>{" "}
                        first, then add it here. Until then this section shows
                        nothing on the site.
                    </p>
                ) : (
                    <div className="grid gap-2">
                        {c.serviceIds.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                Add at least one service. The site shows each
                                one&apos;s current name, duration and price.
                            </p>
                        ) : (
                            <ol className="grid gap-1.5">
                                {c.serviceIds.map((id, index) => {
                                    const service = byId.get(id);
                                    const note = !service
                                        ? "Deleted — not shown on the site"
                                        : service.status === "ARCHIVED"
                                          ? "Archived — not shown on the site"
                                          : null;
                                    return (
                                        <li
                                            key={id}
                                            className="flex items-center gap-2 rounded-md border px-3 py-2"
                                        >
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-sm">
                                                    {service?.name ??
                                                        "Unknown service"}
                                                </p>
                                                {note ? (
                                                    <p className="text-sm text-muted-foreground">
                                                        {note}
                                                    </p>
                                                ) : null}
                                            </div>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                disabled={index === 0}
                                                onClick={() => move(index, -1)}
                                                aria-label={`Move ${service?.name ?? "service"} up`}
                                            >
                                                Up
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                disabled={
                                                    index ===
                                                    c.serviceIds.length - 1
                                                }
                                                onClick={() => move(index, 1)}
                                                aria-label={`Move ${service?.name ?? "service"} down`}
                                            >
                                                Down
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={() =>
                                                    patch({
                                                        serviceIds:
                                                            c.serviceIds.filter(
                                                                (x) => x !== id,
                                                            ),
                                                    })
                                                }
                                                aria-label={`Remove ${service?.name ?? "service"}`}
                                            >
                                                Remove
                                            </Button>
                                        </li>
                                    );
                                })}
                            </ol>
                        )}

                        {addable.length > 0 && !full ? (
                            <div className="flex flex-wrap items-center gap-2">
                                <Select
                                    value=""
                                    onValueChange={(id) =>
                                        patch({
                                            serviceIds: [...c.serviceIds, id],
                                        })
                                    }
                                >
                                    <SelectTrigger
                                        aria-label="Add a service"
                                        className="w-auto min-w-48"
                                    >
                                        <SelectValue placeholder="Add a service" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {addable.map((s) => (
                                            <SelectItem key={s.id} value={s.id}>
                                                {s.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {addable.length > 1 ? (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() =>
                                            patch({
                                                serviceIds: [
                                                    ...c.serviceIds,
                                                    ...addable.map((s) => s.id),
                                                ].slice(0, MAX_SERVICES),
                                            })
                                        }
                                    >
                                        Add all
                                    </Button>
                                ) : null}
                            </div>
                        ) : full ? (
                            <p className="text-sm text-muted-foreground">
                                That is the most this section carries.
                            </p>
                        ) : null}
                    </div>
                )}
            </Field>

            <DisplayOptions
                // A list is how services have always shown, so it is absent.
                layout={c.layout ?? "list"}
                onLayout={(v) => patch({ layout: unlessDefault(v, "list") })}
                descriptions={{
                    value: c.showDescriptions !== false,
                    onChange: (on) =>
                        patch({ showDescriptions: hiddenFlag(on) }),
                }}
                prices={{
                    value: c.showPrices !== false,
                    onChange: (on) => patch({ showPrices: hiddenFlag(on) }),
                }}
                button={{
                    value: c.buttonLabel ?? "",
                    onChange: (v) => patch({ buttonLabel: wordsOrAbsent(v) }),
                    placeholder: "Choose a time",
                    note: "On each service, opening your booking page at it. Leave empty to keep each service's own “Book”.",
                }}
            />

            {/*
             * The section's own button, under the list (#207), kept apart
             * from each service's: it goes wherever the merchant points it.
             */}
            <Field label="Button below the list">
                <Input
                    value={c.cta?.label ?? ""}
                    onChange={(e) =>
                        patch({ cta: withCtaLabel(c.cta, e.target.value) })
                    }
                    placeholder="Book now. Optional."
                />
            </Field>
            {c.cta?.label.trim() ? (
                <CtaActionFields
                    action={actionOf(c.cta)}
                    pages={pages}
                    onChange={(action) =>
                        patch({ cta: withCtaAction(c.cta, action) })
                    }
                />
            ) : null}

            {resolveVariant("servicesList", c) === "priceCard" ? (
                <PriceCardFields content={c} patch={patch} />
            ) : null}
        </div>
    );
}

/**
 * The price card's own words (template polish). The price and how long it
 * takes are the service's, set in Services; these are the lines around them.
 */
function PriceCardFields({
    content: c,
    patch,
}: {
    content: ServicesListContent;
    patch: (next: Partial<ServicesListContent>) => void;
}) {
    const includes = c.includes ?? [];
    const setIncludes = (next: string[]) =>
        patch({ includes: next.length > 0 ? next : undefined });
    return (
        <>
            <p className="text-sm text-muted-foreground">
                The card shows the first service here, with its price and how
                long it takes from Services.
            </p>
            <Field label="Under the price">
                <Input
                    value={c.modeLine ?? ""}
                    onChange={(e) =>
                        patch({ modeLine: e.target.value || undefined })
                    }
                    maxLength={160}
                    placeholder="In person, or by video"
                />
            </Field>
            <Field label="Under the button">
                <Textarea
                    value={c.followUpLine ?? ""}
                    onChange={(e) =>
                        patch({ followUpLine: e.target.value || undefined })
                    }
                    rows={2}
                    maxLength={300}
                    placeholder="Optional. What a follow-up costs, and how often."
                />
            </Field>
            <Field label="What it includes">
                <div className="grid gap-2">
                    {includes.map((line, i) => (
                        <div key={i} className="flex items-center gap-2">
                            <Input
                                value={line}
                                aria-label={`Included ${i + 1}`}
                                maxLength={200}
                                onChange={(e) =>
                                    setIncludes(
                                        includes.map((v, j) =>
                                            j === i ? e.target.value : v,
                                        ),
                                    )
                                }
                                placeholder="A written plan afterwards"
                            />
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                aria-label={`Remove included ${i + 1}`}
                                onClick={() =>
                                    setIncludes(
                                        includes.filter((_, j) => j !== i),
                                    )
                                }
                            >
                                Remove
                            </Button>
                        </div>
                    ))}
                    {includes.length < 12 ? (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="justify-self-start"
                            onClick={() => setIncludes([...includes, ""])}
                        >
                            Add a line
                        </Button>
                    ) : null}
                </div>
            </Field>
            {includes.length > 0 ? (
                <Field label="Label over them">
                    <Input
                        value={c.includesLabel ?? ""}
                        onChange={(e) =>
                            patch({
                                includesLabel: e.target.value || undefined,
                            })
                        }
                        maxLength={60}
                        placeholder="What it includes"
                    />
                </Field>
            ) : null}
        </>
    );
}
