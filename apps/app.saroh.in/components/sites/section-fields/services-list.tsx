"use client";

import Link from "next/link";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@saroh/ui/select";
import { Switch } from "@saroh/ui/switch";
import { Textarea } from "@saroh/ui/textarea";

import type { ServicesListContent } from "@/lib/sites/service";

import { CtaActionFields, actionOf } from "./cta-action-fields";
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

            <div className="flex items-center justify-between gap-3">
                <Label htmlFor={`${section.key ?? "services"}-prices`}>
                    Show prices
                </Label>
                <Switch
                    id={`${section.key ?? "services"}-prices`}
                    checked={c.showPrices !== false}
                    onCheckedChange={(on) =>
                        patch({ showPrices: on ? undefined : false })
                    }
                />
            </div>

            <Field label="Button label">
                <Input
                    value={c.cta?.label ?? ""}
                    onChange={(e) => {
                        const label = e.target.value;
                        const action = actionOf(c.cta);
                        const blank =
                            !label.trim() &&
                            action.kind === "url" &&
                            !action.href.trim();
                        patch({
                            cta: blank
                                ? undefined
                                : {
                                      label,
                                      action,
                                      style: c.cta?.style ?? "primary",
                                  },
                        });
                    }}
                    placeholder="Book now. Optional."
                />
            </Field>
            {c.cta?.label.trim() ? (
                <CtaActionFields
                    action={actionOf(c.cta)}
                    pages={pages}
                    onChange={(action) =>
                        patch({
                            cta: {
                                label: c.cta?.label ?? "",
                                action,
                                style: c.cta?.style ?? "primary",
                            },
                        })
                    }
                />
            ) : null}
        </div>
    );
}
