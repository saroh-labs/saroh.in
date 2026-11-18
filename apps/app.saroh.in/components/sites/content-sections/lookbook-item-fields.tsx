"use client";

import { useState } from "react";

import { Field } from "@saroh/ui/field";
import { Input } from "@saroh/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@saroh/ui/select";

import type { ServicesLoad } from "@/components/sites/section-fields/types";
import type { GridCatalogueLoad } from "@/components/sites/selling-sections/use-grid-catalogue";
import type { GalleryImage, SitePage } from "@/lib/sites/service";

type LinkKind = "none" | "service" | "product" | "page";

/**
 * One Lookbook photo's own fields (DEC-228): the look's name over the photo,
 * a from-price (empty: read from what it links to) and what it links to — a
 * service ("Book"), a product ("See the product") or a page — picked, never
 * typed, so a rename cannot orphan it.
 */
export function LookbookItemFields({
    image,
    index,
    onChange,
    services,
    catalogue,
    pages,
}: {
    image: GalleryImage;
    index: number;
    onChange: (next: GalleryImage) => void;
    services: ServicesLoad;
    catalogue: GridCatalogueLoad;
    pages: SitePage[];
}) {
    const n = index + 1;
    // A kind chosen but not yet its service, product or page.
    const [picking, setPicking] = useState<LinkKind | null>(null);
    const kind: LinkKind = picking ?? image.link?.kind ?? "none";
    const target =
        image.link?.kind === "service"
            ? image.link.serviceId
            : image.link?.kind === "product"
              ? image.link.productId
              : image.link?.kind === "page"
                ? image.link.pageId
                : "";
    const options: { id: string; name: string }[] =
        kind === "service"
            ? services.status === "ready"
                ? services.services.map(({ id, name }) => ({ id, name }))
                : []
            : kind === "product"
              ? catalogue.status === "ready"
                  ? catalogue.products
                        .filter((p) => p.status === "PUBLISHED")
                        .map(({ id, name }) => ({ id, name }))
                  : []
              : kind === "page"
                ? pages
                      .filter((p) => !p.hidden)
                      .map((p) => ({ id: p.id, name: p.title }))
                : [];
    const setLink = (nextKind: LinkKind, id: string) => {
        setPicking(null);
        const { link: _old, ...rest } = image;
        if (nextKind === "none" || !id) return onChange(rest);
        onChange({
            ...rest,
            link:
                nextKind === "service"
                    ? { kind: "service", serviceId: id }
                    : nextKind === "product"
                      ? { kind: "product", productId: id }
                      : { kind: "page", pageId: id },
        });
    };
    return (
        <div className="grid gap-1.5">
            <Input
                value={image.name ?? ""}
                aria-label={`Look name for image ${n}`}
                maxLength={120}
                onChange={(e) =>
                    onChange({ ...image, name: e.target.value || undefined })
                }
                placeholder="Look name, over the photo: Soft copper"
            />
            <Input
                value={image.fromPrice ?? ""}
                aria-label={`From-price for image ${n}`}
                maxLength={40}
                onChange={(e) =>
                    onChange({
                        ...image,
                        fromPrice: e.target.value || undefined,
                    })
                }
                placeholder="From-price. Empty: read from what it links to"
            />
            <Field label={`Image ${n} links to`}>
                <div className="grid gap-1.5 sm:grid-cols-2">
                    <Select
                        value={kind}
                        onValueChange={(v) => {
                            // A new kind waits for its pick; none clears it.
                            if (v === "none") setLink("none", "");
                            else if (v !== kind) setPicking(v as LinkKind);
                        }}
                    >
                        <SelectTrigger aria-label={`What image ${n} links to`}>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="none">Nothing</SelectItem>
                            <SelectItem value="service">A service</SelectItem>
                            <SelectItem value="product">A product</SelectItem>
                            <SelectItem value="page">A page</SelectItem>
                        </SelectContent>
                    </Select>
                    {kind !== "none" ? (
                        <Select
                            value={picking ? "" : target}
                            onValueChange={(id) => setLink(kind, id)}
                        >
                            <SelectTrigger
                                aria-label={`Which ${kind} image ${n} links to`}
                            >
                                <SelectValue placeholder={`Choose a ${kind}`} />
                            </SelectTrigger>
                            <SelectContent>
                                {options.map((o) => (
                                    <SelectItem key={o.id} value={o.id}>
                                        {o.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    ) : null}
                </div>
            </Field>
        </div>
    );
}
