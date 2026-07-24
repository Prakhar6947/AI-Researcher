import { NextResponse } from "next/server";
import { clearLibrary, getLibraryStats } from "@/lib/agent/store";

export async function GET() {
  return NextResponse.json(getLibraryStats());
}

export async function DELETE() {
  const removedChunks = clearLibrary();
  return NextResponse.json({ removedChunks });
}
