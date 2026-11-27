import { IntentLink } from "@saroh/ui/intent-link";

/**
 * "Location › Hill Road" — the breadcrumb every page that was Sell's uses below
 * a list, with each step but the last a link back (no section crumb, DEC-262).
 */
export function sellCrumbs(
    ...steps: ({ label: string; href: string } | string)[]
) {
    return [
        ...steps.map((step) =>
            typeof step === "string" ? (
                step
            ) : (
                <IntentLink
                    key={step.href}
                    href={step.href}
                    className="hover:text-foreground"
                >
                    {step.label}
                </IntentLink>
            ),
        ),
    ];
}
