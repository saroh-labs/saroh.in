import type { BookPay, PayChoice } from "../model";
import { card } from "../styles";
import { PayOption } from "./pay-option";
import { StepHead } from "./step-head";

/**
 * Step 4: how they pay — now, online through the business's own provider
 * (E11, DEC-059), the deposit now and the rest at the visit (E8), or at the
 * desk. The choices and their words come from `payChoices`: a class is
 * "for this class", an appointment is paid "now", and a service that takes
 * a deposit is never paid at the desk (Pulse Fitness, Kavi Dental).
 */
export function PayStep({
    choices,
    pay,
    onPick,
}: {
    choices: PayChoice[];
    pay: BookPay;
    onPick: (pay: BookPay) => void;
}) {
    return (
        <div className={card}>
            <StepHead n={4} title="Paying" />
            <div role="radiogroup" aria-label="Paying" className="grid gap-2">
                {choices.map((choice) => (
                    <PayOption
                        key={choice.pay}
                        on={pay === choice.pay}
                        label={choice.label}
                        sub={choice.sub}
                        onPick={() => onPick(choice.pay)}
                    />
                ))}
            </div>
        </div>
    );
}
