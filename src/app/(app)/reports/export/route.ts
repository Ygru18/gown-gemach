import { NextResponse, type NextRequest } from "next/server";
import { getCurrentStaff } from "@/lib/auth/session";
import { buildExport, REPORTS, type ReportName } from "@/lib/services/reportExports";
import { toCsv } from "@/lib/csv";
import { isYmd, todayYmd } from "@/lib/dates";
import { getSettings } from "@/lib/services/settings";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const staff = await getCurrentStaff();
  if (!staff || staff.mustChangePassword) return new NextResponse("Unauthorized", { status: 401 });
  const sp = req.nextUrl.searchParams;
  const name = sp.get("report") as ReportName;
  if (!REPORTS.includes(name)) return new NextResponse("Unknown report", { status: 400 });
  const settings = await getSettings();
  const today = todayYmd(settings.timezone);
  const from = isYmd(sp.get("from")) ? sp.get("from")! : `${today.slice(0, 4)}-01-01`;
  const to = isYmd(sp.get("to")) ? sp.get("to")! : today;
  const { headers, rows } = await buildExport(name, { from, to }, today);
  await prisma.activityLog.create({ data: { actorId: staff.id, actorName: staff.fullName, action: "report.export", entityType: "report", entityId: name, summary: `Exported ${name} report (${from} to ${to})` } });
  return new NextResponse(toCsv(headers, rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="gemach-${name}-${from}-to-${to}.csv"`,
      "cache-control": "no-store",
    },
  });
}
