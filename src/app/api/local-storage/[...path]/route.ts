import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { isLocalTestMode } from "@/lib/env";
import { localPath } from "@/lib/storage";
import { getCurrentStaff } from "@/lib/auth/session";

// Local end-to-end test mode only: a stand-in for Supabase Storage.
async function guard(params: Promise<{ path: string[] }>) {
  if (!isLocalTestMode()) return { error: new NextResponse("Not found", { status: 404 }) };
  if (!(await getCurrentStaff())) return { error: new NextResponse("Unauthorized", { status: 401 }) };
  const p = (await params).path.join("/");
  return { file: localPath(p) };
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const g = await guard(ctx.params);
  if (g.error) return g.error;
  try {
    const buf = await fs.readFile(g.file!);
    return new NextResponse(buf, { headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=60" } });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const g = await guard(ctx.params);
  if (g.error) return g.error;
  await fs.mkdir(path.dirname(g.file!), { recursive: true });
  await fs.writeFile(g.file!, Buffer.from(await req.arrayBuffer()));
  return NextResponse.json({ ok: true });
}
