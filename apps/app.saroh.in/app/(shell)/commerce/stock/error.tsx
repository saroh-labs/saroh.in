"use client";

import { SectionError } from "@/components/shared/section-error";

/**
 * The stock levels couldn't be read. Never an empty table: a merchant on the
 * shop floor would read that as nothing on the shelves.
 */
export default function Error({
    error,
    retry,
}: {
    error: Error & { digest?: string };
    retry: () => void;
}) {
    return (
        <SectionError
            error={error}
            retry={retry}
            heading="Stock"
            things="stock"
            reassurance="Nothing has changed on your shelves."
            backHref="/commerce/products"
            place="Products"
        />
    );
}
