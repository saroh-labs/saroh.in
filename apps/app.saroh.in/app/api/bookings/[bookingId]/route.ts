import { bookingServer, mayReadBookingsList } from "@/lib/bookings/access";
import { NOT_ALLOWED, readRoute } from "@/lib/query/route";

/** One booking's page (DEC-259); another business's booking is a 404. */
export const dynamic = "force-dynamic";
export const GET = readRoute(bookingServer, mayReadBookingsList);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
