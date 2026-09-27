import { Section } from "./fields";

/**
 * At a glance (E2): the price, the time it needs, and how it is booked this
 * week and ahead. Rows come from `glance()`, so a failed bookings read says
 * so rather than showing a zero.
 */
export function AtAGlance({ rows }: { rows: [string, string][] }) {
    return (
        <Section title="At a glance">
            <dl>
                {rows.map(([label, value]) => (
                    <div
                        key={label}
                        className="flex gap-2.5 border-t border-border/60 py-[7px] text-[13px]"
                    >
                        <dt className="flex-1 text-muted-foreground">
                            {label}
                        </dt>
                        <dd className="text-right font-semibold tabular-nums">
                            {value}
                        </dd>
                    </div>
                ))}
            </dl>
        </Section>
    );
}
