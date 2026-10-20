import type { FrameBarProps } from "./frames/frame-parts";
import type { LookStep } from "./look-words";
import { finalLabel, nextLabel } from "./look-words";
import type { BookingFlowEngine } from "./use-booking-flow";

/**
 * A look's step button and the bar it sits in (DEC-172, U10): one filled
 * button per view, saying what happens next — "Next: pick a time", "Pay
 * ₹2,500 and book", "Confirm booking". A step that can't go yet draws it
 * quiet, and pressing it says what is missing instead (`onNudge`); on Your
 * details before the code, pressing it sends the code or asks for it
 * (`pressCode`, given by the frame's owner). Nothing here books but `act.confirm`, Classic's own.
 */
export function stepBar({
    view,
    flow,
    next,
    nudge,
    onNudge,
    go,
}: {
    view: LookStep | null;
    flow: BookingFlowEngine;
    /** The step after this one, for "Next: …". */
    next: LookStep | null;
    nudge: string | null;
    onNudge: (text: string) => void;
    go: (step: LookStep | null) => void;
}): {
    bar: FrameBarProps | null;
    /** The button's press; `pressCode` sends or asks for the code. */
    press: (pressCode: () => void) => void;
} {
    if (!view) return { bar: null, press: () => undefined };
    const { s, times, words, act } = flow;
    const { service } = times;
    const { customer } = s;
    const chosen = flow.chosenStart;

    const press = (pressCode: () => void): void => {
        switch (view) {
            case "what":
                if (!service) return onNudge("Pick what you'd like to book.");
                return go(next);
            case "who":
                return go("when");
            case "when":
                if (!chosen) return onNudge("Pick a time first.");
                return go("details");
            case "details":
                // A test release stops here as Classic does: what the live
                // site would do, and nothing sent (DEC-071, T6).
                if (!customer && flow.testRelease) return void act.confirm();
                if (!customer) {
                    s.setTouched(true);
                    pressCode();
                    return;
                }
                if (flow.block) {
                    s.setTouched(true);
                    return onNudge(flow.block);
                }
                if (flow.lookPay) return go("pay");
                return void act.confirm();
            case "pay":
                return void act.confirm();
        }
    };
    const final = finalLabel({
        pay: words.pay,
        payingNow: words.payingNow,
        waitMode: flow.waitMode,
    });
    const label =
        view === "when" && !chosen
            ? "Pick a time first"
            : view === "pay" || (view === "details" && !flow.lookPay)
              ? final
              : nextLabel(next ?? "details");
    const blocked =
        view === "what"
            ? !service
            : view === "when"
              ? !chosen
              : view === "details"
                ? !customer || !!flow.block
                : view === "pay"
                  ? !!flow.block
                  : false;
    const paying = view === "pay" || view === "details";
    const bar: FrameBarProps = {
        summary:
            view === "what"
                ? service
                    ? `${service.name} · ${service.durationMinutes} min`
                    : ""
                : paying
                  ? [words.dueLabel, flow.whenText].filter(Boolean).join(" · ")
                  : flow.whenText || (service?.name ?? ""),
        price: paying ? words.due : (words.price ?? ""),
        status: s.message?.tone === "error" ? null : nudge,
        action: {
            label,
            onPress: () => undefined,
            blocked,
            busy: s.submitting,
        },
    };
    return { bar, press };
}
