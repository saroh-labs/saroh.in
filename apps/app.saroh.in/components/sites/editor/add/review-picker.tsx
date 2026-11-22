"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { ChoiceGroup } from "@saroh/ui/choice-group";
import { EmptyState } from "@saroh/ui/data-state";
import { FailedRead } from "@saroh/ui/failed-read";
import { Field } from "@saroh/ui/field";
import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import { Notice } from "@saroh/ui/notice";
import { Segmented } from "@saroh/ui/segmented";
import { Textarea } from "@saroh/ui/textarea";
import { MapPin } from "lucide-react";
import { useState } from "react";

import { formatDate } from "@/lib/format/datetime";
import { stars } from "@/lib/product-reviews/describe";
import type { PickerReview } from "@/lib/product-reviews/picker-read";

/** One testimonial as the section holds it (the contract's item). */
export interface ReviewItem {
    quote: string;
    name: string;
    role?: string;
}

/** A Testimonials section already on the page, by its place. */
export interface ReviewTarget {
    index: number;
    heading: string;
    /** It holds the most a Testimonials section takes. */
    full: boolean;
}

type Source = "products" | "write" | "google";

/** The quote and name limits of a testimonial (section contract). */
const QUOTE_MAX = 600;
const NAME_MAX = 120;

/**
 * Add › From your business › A review (round 3, `EBReviewPicker` and
 * `EBReviewPickerPhone`, A9): pick a product review the customer agreed
 * to show, or write one by hand, a customer's own words with their name,
 * kept in the section as the merchant's own (no "verified" mark). Google
 * is shown as coming, not built. It adds a Testimonials section with the
 * quote, or the quote to a Testimonials section already on the page.
 */
export function ReviewPicker({
    reviews,
    targets,
    below,
    onBack,
    onRetry,
    onAdd,
}: {
    /** The product reviews to pick from; null when they can't be read. */
    reviews: PickerReview[] | null;
    targets: ReviewTarget[];
    below: string | null;
    onBack: () => void;
    /** Reads the product reviews again, after a failed read. */
    onRetry?: () => void;
    /** `into`: a Testimonials section's index, or null for a new one. */
    onAdd: (item: ReviewItem, into: number | null) => void;
}) {
    const list = reviews ?? [];
    const [source, setSource] = useState<Source>(
        list.length > 0 ? "products" : "write",
    );
    const [picked, setPicked] = useState<string | null>(list[0]?.id ?? null);
    const [quote, setQuote] = useState("");
    const [name, setName] = useState("");
    const [tried, setTried] = useState(false);
    const open = targets.filter((t) => !t.full);
    const [into, setInto] = useState<string>("new");

    const item = (): ReviewItem | null => {
        if (source === "products") {
            const r = list.find((x) => x.id === picked);
            return r
                ? { quote: r.quote, name: r.name, role: r.productName }
                : null;
        }
        if (source === "write" && quote.trim() && name.trim()) {
            return { quote: quote.trim(), name: name.trim() };
        }
        return null;
    };

    const add = () => {
        setTried(true);
        const it = item();
        if (it) onAdd(it, into === "new" ? null : Number(into));
    };

    return (
        <section
            aria-label="Add a review"
            data-review-picker=""
            className="flex min-h-0 flex-1 flex-col"
        >
            <div className="border-b px-4 pb-3 pt-3.5">
                <h3 className="text-base font-semibold">Add a review</h3>
            </div>
            <div className="px-4 pt-3">
                <Segmented
                    label="Where the review comes from"
                    block
                    options={[
                        { value: "products", label: "Products" },
                        { value: "write", label: "Write one" },
                        {
                            value: "google",
                            label: (
                                <span className="inline-flex items-center gap-1">
                                    Google
                                    <Badge variant="info" size="sm">
                                        Soon
                                    </Badge>
                                </span>
                            ),
                        },
                    ]}
                    value={source}
                    onValueChange={(v) => {
                        setSource(v);
                        setTried(false);
                    }}
                />
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 py-3.5">
                {source === "products" ? (
                    list.length === 0 ? (
                        reviews === null ? (
                            <FailedRead
                                size="inline"
                                things="product reviews"
                                reassurance="You can still write one."
                                onRetry={onRetry}
                            />
                        ) : (
                            <EmptyState
                                size="inline"
                                title="No product reviews to show yet."
                                description="Write one instead."
                            />
                        )
                    ) : (
                        <>
                            <ChoiceGroup
                                label="Product reviews"
                                className="grid gap-2"
                                choices={list.map((r) => ({
                                    value: r.id,
                                    label: (
                                        <span className="grid gap-0.5 text-left">
                                            <span
                                                className="text-xs tracking-[1px] text-warning-subtle-foreground"
                                                aria-label={`${r.rating} of 5 stars`}
                                            >
                                                {stars(r.rating)}
                                            </span>
                                            <span
                                                data-ph-mask=""
                                                className="text-[0.84rem] leading-snug"
                                            >
                                                &ldquo;{r.quote}&rdquo;
                                            </span>
                                            <span
                                                data-ph-mask=""
                                                className="text-xs text-muted-foreground"
                                            >
                                                {r.name} · {r.productName} ·{" "}
                                                {formatDate(r.createdAt, "UTC")}
                                            </span>
                                        </span>
                                    ),
                                }))}
                                value={picked}
                                onChange={setPicked}
                                itemClassName={(on) =>
                                    cn(
                                        "min-h-11 rounded-[10px] border px-3 py-2.5",
                                        on
                                            ? "border-foreground ring-1 ring-inset ring-foreground"
                                            : "hover:bg-muted",
                                    )
                                }
                            />
                            <p className="text-xs text-muted-foreground">
                                Only reviews the customer agreed to show. The
                                first name and the product go with the quote.
                            </p>
                        </>
                    )
                ) : source === "write" ? (
                    <>
                        <Field
                            label="What they said"
                            error={
                                tried && !quote.trim()
                                    ? "Write what they said."
                                    : undefined
                            }
                        >
                            <Textarea
                                value={quote}
                                rows={4}
                                maxLength={QUOTE_MAX}
                                onChange={(e) => setQuote(e.target.value)}
                            />
                        </Field>
                        <Field
                            label="Their name"
                            error={
                                tried && !name.trim()
                                    ? "Say who said it."
                                    : undefined
                            }
                        >
                            <Input
                                value={name}
                                maxLength={NAME_MAX}
                                onChange={(e) => setName(e.target.value)}
                            />
                        </Field>
                        <p className="text-xs text-muted-foreground">
                            Write what a customer told you, in their words.
                            Shown as it is, without a &ldquo;verified&rdquo;
                            mark.
                        </p>
                    </>
                ) : (
                    <div className="my-auto grid justify-items-center gap-2.5 px-2.5 text-center">
                        <MapPin
                            aria-hidden
                            className="size-7 text-muted-foreground"
                        />
                        <p className="font-semibold">
                            Pick from your Google reviews
                        </p>
                        <p className="text-xs text-muted-foreground">
                            Once your Google Business Profile is connected, its
                            reviews show here to pick from. Connecting Google is
                            coming.
                        </p>
                        <Button type="button" disabled aria-disabled>
                            Connect Google · coming
                        </Button>
                    </div>
                )}

                {source !== "google" && open.length > 0 ? (
                    <ChoiceGroup
                        label="Goes in"
                        className="grid gap-1.5"
                        choices={[
                            {
                                value: "new",
                                label: "A new Testimonials section",
                            },
                            ...open.map((t) => ({
                                value: String(t.index),
                                label: `Add to ${t.heading}`,
                            })),
                        ]}
                        value={into}
                        onChange={setInto}
                        itemClassName={(on) =>
                            cn(
                                "min-h-9 rounded-lg border px-3 text-left text-[0.8125rem] coarse:min-h-11",
                                on
                                    ? "border-foreground ring-1 ring-inset ring-foreground"
                                    : "hover:bg-muted",
                            )
                        }
                    />
                ) : null}
                {tried && source === "products" && !item() ? (
                    <Notice tone="error">Pick a review.</Notice>
                ) : null}
            </div>
            <div className="grid gap-1.5 border-t px-4 py-3">
                <div className="flex justify-end gap-2">
                    {/* Two even buttons on a phone (EBReviewPickerPhone). */}
                    <Button
                        type="button"
                        variant="outline"
                        className="flex-1 min-[760px]:flex-none"
                        onClick={onBack}
                    >
                        Cancel
                    </Button>
                    {source === "google" ? null : (
                        <Button
                            type="button"
                            className="flex-1 min-[760px]:flex-none"
                            onClick={add}
                        >
                            Add to the page
                        </Button>
                    )}
                </div>
                {source === "google" ? null : (
                    <p className="text-xs text-muted-foreground">
                        {into !== "new"
                            ? "Goes in at the end of that section. "
                            : below
                              ? `Goes in below ${below}. `
                              : "Goes in at the end. "}
                        Nothing is live until you publish.
                    </p>
                )}
            </div>
        </section>
    );
}
