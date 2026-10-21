import type { BookingAccount } from "./booking-account";
import type { WaitMode } from "./flow-words";
import type { BookingStart, BookPay, OfferedCredit } from "./model";
import type { AttemptKeys, FlowState } from "./use-flow-state";
import type { Times } from "./use-times";
import type { WaitlistPlace } from "./waitlist";

/** Everything the booking page's actions read and change. */
export interface FlowActionsContext {
    s: FlowState;
    keys: AttemptKeys;
    account: BookingAccount;
    apiUrl: string;
    times: Times;
    chosenStart: BookingStart | null;
    zone: string;
    block: string;
    testRelease: boolean;
    offerAfter: React.RefObject<string | null>;
    waitMode: WaitMode;
    pay: BookPay;
    credit: OfferedCredit | null;
    askCredit: (
        who: string,
        serviceId: string,
        startAt: string,
    ) => Promise<OfferedCredit | null>;
    reloadCredit: () => void;
    putPlace: (joined: WaitlistPlace) => void;
    dropPlace: (startAt: string) => void;
    price: string | null;
    payingNow: string;
    rest: string | null;
    whenText: string;
    bookerFirst: string;
    /** What the booking page asks beyond the time, as the API takes it. */
    extras: Record<string, string>;
    /** The next change of step is a new history entry (U9). */
    willPush: () => void;
}
