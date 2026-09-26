import type { BookingService } from "../model";
import { formatMoney, serviceLine } from "../model";
import { card, optionClasses } from "../styles";
import { StepHead } from "./step-head";

/** Step 1: what they would like to book. */
export function ServiceStep({
    services,
    serviceId,
    onPick,
}: {
    services: BookingService[];
    serviceId: string | null;
    onPick: (id: string) => void;
}) {
    return (
        <div className={card}>
            <StepHead n={1} title="What would you like?" />
            <div
                role="radiogroup"
                aria-label="What would you like?"
                className="grid gap-2"
            >
                {services.map((s) => {
                    const on = s.id === serviceId;
                    const p = formatMoney(s.priceCents, s.currency);
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
                            </span>
                            {p ? (
                                <span className="text-[15px] font-semibold tabular-nums">
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
