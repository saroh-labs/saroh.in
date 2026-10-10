"use client";

import { FieldError } from "@saroh/ui/field";
import { Input } from "@saroh/ui/input";
import { Textarea } from "@saroh/ui/textarea";
import Link from "next/link";

import type { CategoryNode } from "@/lib/collections/rules";
import {
    categoryChoices,
    COLLECTION_NAME_MAX,
    ruleNote,
} from "@/lib/collections/rules";
import { productSettingsHref } from "@/lib/products/links";
import { OptionSelect } from "@saroh/ui/option-select";

/**
 * The collection sheet's fields (#524), at the product page sheets' scale:
 * 12.5px labels, 11.5px help, 36px controls. Each says its own refusal —
 * the sheet's check or the API's — under it.
 */

const LABEL = "block";

export function NameField({
    value,
    onChange,
    disabled,
    error,
}: {
    value: string;
    onChange: (value: string) => void;
    disabled: boolean;
    error?: string;
}) {
    return (
        <div className="space-y-1.5">
            <label htmlFor="collection-name" className={LABEL}>
                Name
            </label>
            <Input
                id="collection-name"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                maxLength={COLLECTION_NAME_MAX + 20}
                placeholder="Weekend bakes"
                disabled={disabled}
                aria-invalid={!!error}
                aria-describedby={error ? "collection-name-error" : undefined}
            />
            <FieldError id="collection-name-error">{error}</FieldError>
        </div>
    );
}

export function DescriptionField({
    value,
    onChange,
    disabled,
    error,
}: {
    value: string;
    onChange: (value: string) => void;
    disabled: boolean;
    error?: string;
}) {
    return (
        <div className="space-y-1.5">
            <label htmlFor="collection-description" className={LABEL}>
                Description{" "}
                <span className="font-normal text-muted-foreground">
                    (optional)
                </span>
            </label>
            <Textarea
                id="collection-description"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                rows={2}
                disabled={disabled}
                placeholder="What's in it, in a line."
                aria-invalid={!!error}
                className="leading-[1.55]"
            />
            <FieldError>{error}</FieldError>
        </div>
    );
}

/**
 * An automatic collection's rule: the category it fills itself from, and
 * so the ones inside it. With no categories yet, where to make one.
 */
export function CategoryField({
    categories,
    value,
    onChange,
    disabled,
    error,
}: {
    categories: CategoryNode[];
    value: string;
    onChange: (value: string) => void;
    disabled: boolean;
    error?: string;
}) {
    return (
        <div className="space-y-1.5">
            <label htmlFor="collection-category" className={LABEL}>
                Category
            </label>
            {categories.length === 0 ? (
                <p className="text-[12.5px] text-muted-foreground">
                    There are no categories yet.{" "}
                    <Link
                        href={productSettingsHref("categories")}
                        className="text-brand transition-colors hover:text-foreground active:text-muted-foreground"
                    >
                        Manage categories
                    </Link>
                </p>
            ) : (
                <OptionSelect
                    id="collection-category"
                    value={value}
                    onValueChange={onChange}
                    options={categoryChoices(categories)}
                    placeholder="Pick a category"
                    disabled={disabled}
                    aria-invalid={!!error}
                />
            )}
            <p className="text-[11.5px] leading-[1.5] text-muted-foreground">
                {ruleNote(categories, value)}
            </p>
            <FieldError>{error}</FieldError>
        </div>
    );
}

/**
 * What the sheet says above its fields: a role that can't change
 * collections, a collection still being read, or one that couldn't be.
 */
export function SheetNotices({
    canWrite,
    loading,
    loadError,
}: {
    canWrite: boolean;
    loading: boolean;
    loadError: string | null;
}) {
    return (
        <>
            {!canWrite ? (
                <p className="rounded-[9px] bg-muted px-3 py-2.5 text-[12.5px] text-muted-foreground">
                    Your role can see collections but not change them. An owner
                    or admin can.
                </p>
            ) : null}
            {loadError ? (
                <p
                    role="alert"
                    className="rounded-[9px] border border-destructive/40 px-3 py-2.5 text-[12.5px] text-destructive"
                >
                    {loadError}
                </p>
            ) : null}
            {loading ? (
                <p
                    role="status"
                    aria-busy
                    className="text-[12.5px] text-muted-foreground"
                >
                    Reading the collection…
                </p>
            ) : null}
        </>
    );
}
