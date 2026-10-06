import type { BookPay, PayChoice } from "../model";
import { card } from "../styles";
import { PayOption } from "./pay-option";
import { StepHead } from "./step-head";

/**
 * Step 4: how they pay — with a class credit of their own, first and chosen
 * by default when the API offers one (A10, the Pulse Fitness design); now,
 * online through the business's own provider (E11, DEC-059); the deposit now
 * and the rest at the visit (E8); or at the desk. The choices and their
 * words come from `payChoices` and `creditChoice`: a class is "for this
 * class", an appointment is paid "now", and a service that takes a deposit
 * is paid at the desk only when online can't take it (Pulse Fitness, Kavi
 * Dental, DEC-089).
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
                        tag={choice.tag}
                        onPick={() => onPick(choice.pay)}
                    />
                ))}
            </div>
        </div>
    );
}
