import { Avatar, AvatarFallback, avatarInitials } from "@saroh/ui/avatar";
import { TextLink } from "@saroh/ui/text-link";

import type { SellsRead } from "@/lib/insights/reads";
import { customersView } from "@/lib/insights/sells-words";

import { AnswerCard, AnswerLink, AnswerText } from "./answer-card";

/**
 * "Who are my best customers?" (DEC-171, plan U13, #1095; `IBSellsD`,
 * `IBSellsP`): who came back and who came for the first time, then the top
 * five, each with their initials, what else is known of them (company,
 * what they buy most, "Shop and online"), what they paid and what they did
 * most ("4 deliveries", "3 classes"), and their person page.
 *
 * Without payments they are ranked by how often they came, with no money;
 * without customers' names, each is a number in the order they rank, with
 * no link (the tab's one notice says why). Nobody yet: one sentence
 * (`IBSellsEmptyD`).
 */
export function BestCustomers({ read }: { read: SellsRead }) {
    const view = customersView(read);
    return (
        <AnswerCard
            question="Who are my best customers?"
            data-testid="sells-customers"
        >
            <AnswerText answer={view.answer} />
            {view.rows.length > 0 ? (
                <ol className="w-full" data-ph-mask="">
                    {view.rows.map((row, i) => (
                        <li
                            key={row.key}
                            data-row="customer"
                            className="flex items-center gap-2.5 border-t border-border/70 py-[9px] text-[13.5px]"
                        >
                            {row.name ? (
                                <Avatar size="row" aria-hidden>
                                    <AvatarFallback>
                                        {avatarInitials(row.name)}
                                    </AvatarFallback>
                                </Avatar>
                            ) : (
                                <span
                                    aria-hidden
                                    className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-bold"
                                >
                                    {i + 1}
                                </span>
                            )}
                            <span className="grid min-w-0 flex-1 gap-px">
                                <span className="truncate font-semibold">
                                    {row.name && row.href ? (
                                        <TextLink href={row.href}>
                                            {row.name}
                                        </TextLink>
                                    ) : (
                                        (row.name ?? `Customer ${i + 1}`)
                                    )}
                                </span>
                                {row.sub ? (
                                    <small className="truncate text-xs text-muted-foreground">
                                        {row.sub}
                                    </small>
                                ) : null}
                            </span>
                            {row.amount ? (
                                <span className="shrink-0 font-semibold tabular-nums">
                                    {row.amount}
                                </span>
                            ) : null}
                            {row.often ? (
                                <span className="min-w-[76px] shrink-0 text-right text-xs text-muted-foreground">
                                    {row.often}
                                </span>
                            ) : null}
                        </li>
                    ))}
                </ol>
            ) : null}
            {view.seeAll ? (
                <AnswerLink href={view.seeAll.href}>
                    {view.seeAll.label}
                </AnswerLink>
            ) : null}
        </AnswerCard>
    );
}
