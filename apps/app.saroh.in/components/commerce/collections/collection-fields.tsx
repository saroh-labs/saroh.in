"use client";

import { Field } from "@saroh/ui/field";
import { Input } from "@saroh/ui/input";
import { Textarea } from "@saroh/ui/textarea";

import type { CategoryNode } from "@/lib/collections/rules";
import {
    categoryChoices,
    COLLECTION_NAME_MAX,
    ruleNote,
} from "@/lib/collections/rules";
import { productSettingsHref } from "@/lib/products/links";
import { Notice } from "@saroh/ui/notice";
import { OptionSelect } from "@saroh/ui/option-select";
import { TextLink } from "@saroh/ui/text-link";

/**
 * The collection sheet's fields (#524), at the product page sheets' scale:
 * 12.5px labels, 11.5px help, 36px controls. Each says its own refusal —
 * the sheet's check or the API's — under it.
 */

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
        <Field label="Name" error={error}>
            <Input
                id="collection-name"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                maxLength={COLLECTION_NAME_MAX + 20}
                placeholder="Weekend bakes"
                disabled={disabled}
            />
        </Field>
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
        <Field label="Description" optional error={error}>
            <Textarea
                id="collection-description"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                rows={2}
                disabled={disabled}
                placeholder="What's in it, in a line."
                className="leading-[1.55]"
            />
        </Field>
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
        <Field label="Category" htmlFor="collection-category" error={error}>
            <>
                {categories.length === 0 ? (
                    <p className="text-[12.5px] text-muted-foreground">
                        There are no categories yet.{" "}
                        <TextLink href={productSettingsHref("categories")}>
                            Manage categories
                        </TextLink>
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
                        aria-describedby={
                            error ? "collection-category-note" : undefined
                        }
                    />
                )}
                <p className="text-[11.5px] leading-[1.5] text-muted-foreground">
                    {ruleNote(categories, value)}
                </p>
            </>
        </Field>
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
            {loadError ? <Notice tone="error">{loadError}</Notice> : null}
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
