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
          price: string;
      }
    | { kind: "expired"; when: string }
    | {
          kind: "done";
          booking: BookResult;
          paid: boolean;
          price: string | null;
          when: string;
          first: string;
      };
