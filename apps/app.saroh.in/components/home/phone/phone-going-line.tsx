import { TextLink } from "@saroh/ui/text-link";
import { ChevronRight } from "lucide-react";

import type { HomeGoing } from "@/lib/home/service";
import { MONTH_HREF } from "@/lib/home/week";
import { goingSentence } from "@/lib/insights/compare-words";

/**
 * How it's going on a phone (DEC-171, plan U17, R9, board `HPHome`): one
 * sentence, the last 7 days against the 7 before ("Last 7 days: ₹48,250,
 * up 12% on the 7 days before."), counts for a role without money, and
 * the way into Insights for whoever it is open to. The figures themselves
 * live in Insights. Nothing when none of it may be read.
 */
export function PhoneGoingLine({
    going,
    insights,
}: {
    going: HomeGoing;
    insights: boolean;
}) {
    const sentence = goingSentence(going);
    if (!sentence) return null;
    return (
        <section aria-labelledby="home-phone-going" className="grid gap-2">
            <h2
                id="home-phone-going"
                data-ph-unmask=""
                className="font-display text-[17px] font-semibold tracking-[-0.02em]"
            >
                How it&apos;s going
            </h2>
            <p className="text-pretty text-[15px] leading-normal text-foreground/90">
                {sentence}
            </p>
            {insights ? (
                <TextLink
                    href={MONTH_HREF}
                    data-ph-unmask=""
                    className="justify-self-start text-[13.5px] coarse:min-h-11"
                >
                    Insights
                    <ChevronRight aria-hidden className="size-4" />
                </TextLink>
            ) : null}
        </section>
    );
}
