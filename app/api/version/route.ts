import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/version — dice qué código está desplegado.
 * Úsalo para verificar que Render/Vercel ya tomó el último commit.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    commit:
      process.env.RENDER_GIT_COMMIT ??
      process.env.VERCEL_GIT_COMMIT_SHA ??
      "local",
    branch: process.env.RENDER_GIT_BRANCH ?? process.env.VERCEL_GIT_COMMIT_REF ?? "—",
    hora: new Date().toISOString(),
  });
}
