import { Section } from "@/components/services/service-editor/fields";

/** Label and figure rows under a section title, as the design's side cards. */
function Rows({ rows }: { rows: { label: string; value: string }[] }) {
    return (
        <dl>
            {rows.map((r) => (
                <div
                    key={r.label}
                    className="flex gap-2.5 border-t border-border/60 py-[7px] text-[13px]"
                >
                    <dt className="flex-1 text-muted-foreground">{r.label}</dt>
                    <dd className="text-right font-semibold tabular-nums">
                        {r.value}
                    </dd>
                </div>
            ))}
        </dl>
    );
}

/**
 * The Plan Editor's side column (D7): who pays what on a live plan (each
 * keeps the price they joined at), At a glance, and the rules of archiving.
 */
export function PlanAside({
    pays,
    glance,
}: {
    /** Empty for a draft or a plan nobody is on. */
    pays: { label: string; value: string }[];
    glance: { label: string; value: string }[];
}) {
    return (
        <>
            {pays.length > 0 ? (
                <Section title="Who pays what" className="[&>h2]:mb-1">
                    <Rows rows={pays} />
                </Section>
            ) : null}
            <Section title="At a glance" className="[&>h2]:mb-1">
                <Rows rows={glance} />
            </Section>
            <p className="text-pretty text-[12px] leading-[1.5] text-muted-foreground">
                {/* The design says members do this from "their own link";
                    that link (A8) isn't live, so this says what is true now. */}
                Archiving a plan stops new sign-ups; everyone on it carries on.
                You can pause, skip or move anyone on it from their
                subscription.
            </p>
        </>
    );
}
