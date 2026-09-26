"use client";

import { SectionError } from "@/components/shared/section-error";

/**
 * The stock levels couldn't be read. Never an empty table: a merchant on the
 * shop floor would read that as nothing on the shelves.
 */
export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return (
        <SectionError
            error={error}
            reset={reset}
            title="Stock couldn't be loaded"
            description="Nothing has changed on your shelves — Saroh just couldn't read them. Try again in a moment."
            backHref="/commerce/products"
            backLabel="Back to Products"
        />
    );
}
