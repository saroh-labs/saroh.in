import type { BookingService } from "../model";
import { serviceLine, servicePickPrice } from "../model";
import { card, optionClasses } from "../styles";
import { ChosenRow, useFocusOnChange } from "./chosen-row";
import { StepHead } from "./step-head";

/**
 * Step 1: what they would like to book. Once chosen, only that one shows,
 * with Edit to see the others (`editing`).
 */
export function ServiceStep({
    services,
    serviceId,
    onPick,
    editing,
    onEdit,
}: {
    services: BookingService[];
    serviceId: string | null;
    onPick: (id: string) => void;
    editing: boolean;
    onEdit: () => void;
}) {
    const chosen = editing ? null : services.find((s) => s.id === serviceId);
    const focusRef = useFocusOnChange(chosen ? "folded" : "open");
    if (chosen) {
        return (
            <div className={card}>
                <div data-step={1} className="flex items-start gap-2.5">
                    <span
                        aria-hidden="true"
                        className="bg-site-fg text-site-bg flex size-7 flex-none items-center justify-center rounded-full text-[13px] font-bold"
                    >
                        1
                    </span>
                    <ChosenRow
                        rowRef={focusRef}
                        what="what you're booking"
                        value={chosen.name}
                        sub={
                            <>
                                {serviceLine(chosen)}
                                {chosen.description?.trim() ? (
                                    <span className="mt-1.5 block whitespace-pre-line text-sm leading-normal [overflow-wrap:anywhere]">
                                        {chosen.description.trim()}
                                    </span>
                                ) : null}
                            </>
                        }
                        end={servicePickPrice(chosen)}
                        onEdit={services.length > 1 ? onEdit : undefined}
                        className="min-w-0 flex-1"
                    />
                </div>
            </div>
        );
    }
    return (
        <div ref={focusRef} tabIndex={-1} className={`${card} outline-none`}>
            <StepHead n={1} title="What would you like?" />
            <div
                role="radiogroup"
                aria-label="What would you like?"
                className="grid gap-2"
            >
                {services.map((s) => {
                    const on = s.id === serviceId;
                    const p = servicePickPrice(s);
                    return (
                        <button
                            key={s.id}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            onClick={() => onPick(s.id)}
                            className={optionClasses(on)}
                        >
                            <span className="min-w-0 flex-1">
                                <span className="block text-[15px] font-semibold">
                                    {s.name}
                                </span>
                                <span className="text-site-body mt-0.5 block text-[13px]">
                                    {serviceLine(s)}
                                </span>
                                {/* What the chosen one is, in the business's
                                    own words, before a time is picked. */}
                                {on && s.description?.trim() ? (
                                    <span className="text-site-body mt-1.5 block whitespace-pre-line text-sm font-normal leading-normal [overflow-wrap:anywhere]">
                                        {s.description.trim()}
                                    </span>
                                ) : null}
                            </span>
                            {p ? (
                                <span className="whitespace-nowrap text-[15px] font-semibold tabular-nums">
                                    {p}
                                </span>
                            ) : null}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
