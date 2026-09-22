/**
 * Where the editor's read of the org's services stands. The pickers draw each
 * state distinctly: a failed read is never an empty one.
 */
export type ServicesLoad =
    | { status: "loading" }
    | { status: "ready"; services: ServiceOption[] }
    | { status: "failed"; forbidden: boolean; retry: () => void };

/** A service as offered in the booking-section picker. */
export interface ServiceOption {
    id: string;
    name: string;
    status: "ACTIVE" | "ARCHIVED";
}
