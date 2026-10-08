import { ViewerDate } from "@/components/shared/viewer-date";
import type { EnquiryEntry } from "@/lib/crm/enquiries";
import { answersToShow, isLongAnswer } from "@/lib/crm/enquiries";

/**
 * What they wrote (UX-002): the answers of each enquiry sent through the
 * site's forms, at the top of the lead and the contact. Before this the
 * owner got "New enquiry from …" and could read the question nowhere.
 *
 * Renders nothing when there is no enquiry — a lead added by hand has none.
 */
export function EnquiryCard({
    enquiries,
    knownEmail,
}: {
    enquiries: EnquiryEntry[];
    /** The person's email, already in the header; not repeated here. */
    knownEmail: string | null;
}) {
    if (enquiries.length === 0) return null;
    return (
        <section
            aria-labelledby="enquiry-heading"
            className="overflow-hidden rounded-[12px] border border-border bg-card"
        >
            <h2
                id="enquiry-heading"
                className="border-b border-muted px-4 py-[13px] text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground"
            >
                {enquiries.length === 1
                    ? "What they wrote"
                    : `What they wrote · ${enquiries.length} enquiries`}
            </h2>
            <ul>
                {enquiries.map((entry) => (
                    <li
                        key={entry.id}
                        className="border-b border-foreground/10 last:border-b-0"
                    >
                        <p className="px-4 pt-3 text-[11.5px] text-muted-foreground">
                            {entry.formName ? `${entry.formName} · ` : ""}
                            <ViewerDate
                                iso={entry.createdAt}
                                variant="datetime"
                            />
                        </p>
                        <dl className="grid gap-x-6 gap-y-3 px-4 pb-4 pt-2 text-[13px] sm:grid-cols-2">
                            {answersToShow(entry.answers, knownEmail).map(
                                (answer) => (
                                    <div
                                        key={answer.name}
                                        className={
                                            isLongAnswer(answer)
                                                ? "min-w-0 sm:col-span-2"
                                                : "min-w-0"
                                        }
                                    >
                                        <dt className="text-[11.5px] text-muted-foreground">
                                            {answer.label}
                                        </dt>
                                        <dd className="whitespace-pre-line text-pretty break-words">
                                            {answer.value}
                                        </dd>
                                    </div>
                                ),
                            )}
                        </dl>
                    </li>
                ))}
            </ul>
        </section>
    );
}
