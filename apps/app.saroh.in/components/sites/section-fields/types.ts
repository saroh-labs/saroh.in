/** A service as offered in the booking-section picker. */
export interface ServiceOption {
    id: string;
    name: string;
    status: "ACTIVE" | "ARCHIVED";
}
