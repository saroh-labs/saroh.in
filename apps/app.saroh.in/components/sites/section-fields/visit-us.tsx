"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

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
import { Skeleton } from "@saroh/ui/skeleton";
import { Switch } from "@saroh/ui/switch";

import { listVisitPlacesForPicker } from "@/lib/sites/actions";
import type { VisitUsContent } from "@/lib/sites/service";
import { visitPlaceChoice } from "@/lib/sites/visit-place";
import type { VisitPlacesRead } from "@/lib/stores/storefronts";

import { Field } from "./field";
import type { SectionFieldsProps } from "./props";

const STOREFRONTS = "/commerce/locations";
const HOURS = "/settings/organization?section=hours";

/**
 * The `visitUs` section's editor fields (G8).
 *
 * Only the title is typed here. Which shop it shows is a choice among the
 * business's open SHOP storefronts — never the site's "sells from" one, which
 * may be online-only — and the shop's address, hours and phone are read live
 * by the site. With one shop it is chosen for the merchant and named; with
 * several the panel asks which (ADR-010); with none it says where to add one.
 */
export function VisitUsFields({
    section,
    onChange,
}: SectionFieldsProps<"visitUs">) {
    const c = section.content;
    const patch = (next: Partial<VisitUsContent>) =>
        onChange({ ...section, content: { ...c, ...next } });

    const [read, setRead] = useState<VisitPlacesRead | "loading">("loading");
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        let active = true;
        listVisitPlacesForPicker()
            .then((next) => {
                if (active) setRead(next);
            })
            .catch(() => {
                if (active) setRead({ state: "failed", forbidden: false });
            });
        return () => {
            active = false;
        };
    }, [attempt]);

    const choice = visitPlaceChoice(read, c.storeId);

    // The only shop there is: chosen for the merchant, and named below.
    const adopt =
        choice.kind === "only" && choice.adopt ? choice.place.id : null;
    useEffect(() => {
        if (adopt) patch({ storeId: adopt });
        // `patch` closes over this render's content; the id alone decides.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [adopt]);

    const id = section.key ?? "visit-us";

    return (
        <div className="grid gap-3">
            <Field label="Title">
                <Input
                    value={c.title ?? ""}
                    onChange={(e) =>
                        patch({ title: e.target.value || undefined })
                    }
                    placeholder="Come and see us"
                />
            </Field>

            <Field label="Shop shown">
                {choice.kind === "loading" ? (
                    <Skeleton
                        className="h-9 w-full"
                        aria-label="Loading your shops"
                    />
                ) : choice.kind === "failed" ? (
                    choice.forbidden ? (
                        <p className="text-sm text-muted-foreground">
                            Your role can&apos;t see this business&apos;s
                            storefronts, so the shop can&apos;t be chosen here.
                        </p>
                    ) : (
                        <div className="grid gap-2">
                            <p className="text-sm text-muted-foreground">
                                We couldn&apos;t load your shops. Nothing you
                                chose has changed.
                            </p>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="w-fit"
                                onClick={() => {
                                    setRead("loading");
                                    setAttempt((n) => n + 1);
                                }}
                            >
                                Try again
                            </Button>
                        </div>
                    )
                ) : choice.kind === "none" ? (
                    <p className="text-sm text-muted-foreground">
                        Add a shop with an address in{" "}
                        <Link
                            href={STOREFRONTS}
                            target="_blank"
                            rel="noopener"
                            className="underline hover:text-foreground"
                        >
                            Sell › Storefronts
                        </Link>
                        . An online storefront has no address or hours, so until
                        there is a shop this block shows nothing on your site.
                    </p>
                ) : choice.kind === "only" ? (
                    <p className="text-sm">Showing {choice.place.name}</p>
                ) : (
                    <div className="grid gap-2">
                        {choice.kind === "missing" ? (
                            <p className="text-sm text-muted-foreground">
                                The shop this showed has closed or no longer has
                                an address, so the block shows nothing on your
                                site. Choose another.
                            </p>
                        ) : choice.chosen === null ? (
                            <p className="text-sm text-muted-foreground">
                                Which shop does this show? Until you choose, the
                                block shows nothing on your site.
                            </p>
                        ) : null}
                        <Select
                            value={
                                choice.kind === "pick"
                                    ? (choice.chosen?.id ?? "")
                                    : ""
                            }
                            onValueChange={(storeId) => patch({ storeId })}
                        >
                            <SelectTrigger aria-label="Shop shown">
                                <SelectValue placeholder="Choose a shop" />
                            </SelectTrigger>
                            <SelectContent>
                                {choice.places.map((place) => (
                                    <SelectItem key={place.id} value={place.id}>
                                        {place.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}
            </Field>

            <div className="flex items-center justify-between gap-3">
                <Label htmlFor={`${id}-hours`}>Hours and Open now</Label>
                <Switch
                    id={`${id}-hours`}
                    checked={c.showHours !== false}
                    onCheckedChange={(on) =>
                        patch({ showHours: on ? undefined : false })
                    }
                />
            </div>
            <div className="flex items-center justify-between gap-3">
                <Label htmlFor={`${id}-map`}>Get directions</Label>
                <Switch
                    id={`${id}-map`}
                    checked={c.showMap !== false}
                    onCheckedChange={(on) =>
                        patch({ showMap: on ? undefined : false })
                    }
                />
            </div>

            <p className="text-sm text-muted-foreground">
                The address lives on the storefront (
                <Link
                    href={STOREFRONTS}
                    target="_blank"
                    rel="noopener"
                    className="underline hover:text-foreground"
                >
                    Sell › Storefronts
                </Link>
                ); the hours in{" "}
                <Link
                    href={HOURS}
                    target="_blank"
                    rel="noopener"
                    className="underline hover:text-foreground"
                >
                    Settings › Hours
                </Link>
                .
            </p>
        </div>
    );
}
