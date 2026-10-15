import { adminActivityResponse } from "@/lib/http/admin-activity-handler";

export const dynamic = "force-dynamic";

/** GET /api/admin/activity.csv?kind=&userId=&month= → text/csv attachment (BOM + CRLF so Excel opens Vietnamese text correctly). */
export const GET = (req: Request) => adminActivityResponse(req, "csv");
