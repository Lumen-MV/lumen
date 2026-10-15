import { adminActivityResponse } from "@/lib/http/admin-activity-handler";

export const dynamic = "force-dynamic";

/** GET /api/admin/activity?kind=all|view|cloud|translate|login|invite&userId=&month=YYYY-MM → {entries:[{id,kind,userId,userName,time,html,createdAt}], people} */
export const GET = (req: Request) => adminActivityResponse(req, "json");
