import { card } from "../styles";
import { PayOption } from "./pay-option";
import { StepHead } from "./step-head";

/** Step 4: how they pay — now online, or at the desk. */
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
                        label={`Pay ${price} for this ${isClass ? "class" : "session"}`}
                        sub="UPI or card — your place is confirmed straight away"
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
