"use client";

import { Button } from "@saroh/ui/button";
import { FailedState } from "@saroh/ui/data-state";
import { reportError } from "@saroh/ui/lib/report-error";
import { backTo, couldntLoad } from "@saroh/ui/lib/state-copy";
import Link from "next/link";
import { useEffect } from "react";

import { ProductPageFrame } from "@/components/commerce/product-page/page-state";
import { SectionError } from "@/components/shared/section-error";
import { isDenial } from "@/lib/api/errors";

/**
 * The product page's own boundary (#522): the product couldn't be read.
 * The failed card under the "‹ Products" bar, with Try again and the way
 * back to Products, and the reference support can look up. A denial whose
 * status survived the throw is a denial, not a failure (`SectionError`).
 *
 * Try again is `retry`, which reads the product again; `reset` alone would
 * redraw the same failed read.
 */
export default function ProductError({
    error,
    retry,
}: {
    error: Error & { digest?: string };
    retry: () => void;
}) {
    const denied = isDenial(error);

    useEffect(() => {
        if (!denied) {
            reportError(error, {
                boundary: "app/product",
                digest: error.digest,
            });
        }
    }, [denied, error]);

    if (denied) {
        return (
            <SectionError
                error={error}
                retry={retry}
                backHref="/commerce/products"
                place="Products"
            />
        );
    }

    return (
        <ProductPageFrame>
            <FailedState
                title={couldntLoad("this product")}
                onRetry={retry}
                reference={error.digest}
                action={
                    <Button asChild variant="ghost" className="wk-press">
                        <Link href="/commerce/products">
                            {backTo("Products")}
                        </Link>
                    </Button>
                }
            />
        </ProductPageFrame>
    );
}
