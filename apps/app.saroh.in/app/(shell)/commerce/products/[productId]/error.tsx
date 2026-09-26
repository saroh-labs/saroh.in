"use client";

import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import {
    ProductPageState,
    stateAction,
} from "@/components/commerce/product-page/page-state";

/**
 * The product page's own boundary (#522): the product couldn't be read.
 * Said as the design says it — nothing about the product changed — with
 * Try again and the way back to Products, and the reference support can
 * look up.
 */
export default function ProductError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        // TODO(#103): forward to an error tracker once one exists.
        console.error(error);
    }, [error]);

    return (
        <ProductPageState
            role="alert"
            icon={TriangleAlert}
            title="Couldn't load this product"
            description={
                <>
                    The connection dropped while we were fetching it. Nothing
                    about the product has changed.
                    {error.digest ? (
                        <span className="mt-1 block font-mono text-[11.5px]">
                            Reference {error.digest}
                        </span>
                    ) : null}
                </>
            }
        >
            <button
                type="button"
                onClick={reset}
                className={stateAction("primary")}
            >
                Try again
            </button>
            <Link
                href="/commerce/products"
                className={stateAction("outline", "self-center")}
            >
                Back to Products
            </Link>
        </ProductPageState>
    );
}
