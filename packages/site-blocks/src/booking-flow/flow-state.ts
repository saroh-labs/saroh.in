import type { PaymentHandoff } from "./api";
import type { BookingDays, BookResult } from "./model";

// ── State ────────────────────────────────────────────────────────────────

export type DaysState =
    | { kind: "idle" }
    | { kind: "loading"; serviceId: string }
    | { kind: "ready"; serviceId: string; days: BookingDays }
    | { kind: "error"; serviceId: string; message: string; gone: boolean };

export type Phase =
    | { kind: "choose" }
    | {
          kind: "paying";
          booking: BookResult;
          token: string;
          handoff: PaymentHandoff | null;
          payError: string | null;
          when: string;
          /** What is being paid now: the price, or only the deposit (E8). */
          price: string;
          /** What is left for the visit when only the deposit is paid. */
          rest?: string | null;
          /**
           * The provider's window closed on a payment (E11). Only a hint:
           * the webhook confirms the booking. If the hold runs out anyway,
           * the expired card says the money may have left their account.
           */
          checkoutPaid?: boolean;
      }
    | { kind: "expired"; when: string; checkoutPaid?: boolean }
    | {
          kind: "done";
          booking: BookResult;
          paid: boolean;
          price: string | null;
          /** Paid a deposit: what is left for the visit (E8). */
          rest?: string | null;
          /** Paid with a class credit (A10): "Used 1 credit from…". */
          creditText?: string | null;
          when: string;
          first: string;
      };
