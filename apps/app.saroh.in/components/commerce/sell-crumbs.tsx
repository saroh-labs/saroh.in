import Link from "next/link";

/**
 * "Sell › Storefronts › Hill Road" — the breadcrumb every Sell page below a
 * list uses, with each step but the last a link back.
 */
export function sellCrumbs(
    ...steps: ({ label: string; href: string } | string)[]
) {
    return [
        "Sell",
        ...steps.map((step) =>
            typeof step === "string" ? (
                step
            ) : (
                <Link
                    key={step.href}
                    href={step.href}
                    className="hover:text-foreground"
                >
                    {step.label}
                </Link>
            ),
        ),
    ];
}
