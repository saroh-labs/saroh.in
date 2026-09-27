import { card } from "../styles";
import { PayOption } from "./pay-option";
import { StepHead } from "./step-head";

/**
 * Step 4: how they pay — now, through the business's own provider (UPI or
 * card, E11), or at the desk. Pay now is offered only when the business has
 * a provider connected. The words are the designs': a class is "for this
 * class", an appointment is paid "now" (Pulse Fitness, Kavi Dental).
 */
export function PayStep({
    canPayNow,
    pay,
    price,
    isClass,
    onPick,
}: {
    canPayNow: boolean;
    pay: "NOW" | "DESK";
    price: string;
    isClass: boolean;
    onPick: (pay: "NOW" | "DESK") => void;
}) {
    return (
        <div className={card}>
            <StepHead n={4} title="Paying" />
            <div role="radiogroup" aria-label="Paying" className="grid gap-2">
                {canPayNow ? (
                    <PayOption
                        on={pay === "NOW"}
                        label={
                            isClass
                                ? `Pay ${price} for this class`
                                : `Pay ${price} now`
                        }
                        sub={`UPI or card — your ${isClass ? "place" : "appointment"} is confirmed straight away`}
                        onPick={() => onPick("NOW")}
                    />
                ) : null}
                <PayOption
                    on={pay === "DESK"}
                    label="Pay at the desk"
                    sub="Held for you; pay when you arrive"
                    onPick={() => onPick("DESK")}
                />
            </div>
        </div>
    );
}
