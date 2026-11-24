import { bookingsServer, mayReadBookingsList } from "@/lib/bookings/access";
import { NOT_ALLOWED, readRoute } from "@/lib/query/route";

/** The bookings list (DEC-259); amounts only for who may see them. */
export const dynamic = "force-dynamic";
export const GET = readRoute(bookingsServer, mayReadBookingsList);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
