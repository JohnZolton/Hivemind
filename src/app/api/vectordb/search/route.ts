import { NextResponse } from "next/server";
import { z } from "zod";

import { appRouter } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";

// Input validation schema
const inputSchema = z.object({
  text: z.string().min(1),
  limit: z.number().min(1).default(5),
});

export async function POST(req: Request) {
  try {
    // Parse request body
    const body = await req.json();

    // Validate input
    const input = inputSchema.parse(body);

    // Create context and caller
    const ctx = await createTRPCContext({ headers: req.headers });
    const caller = appRouter.createCaller(ctx);

    // Search vector DB
    const results = await caller.post.searchVectorDB(input);

    return NextResponse.json(results);
  } catch (error) {
    console.error("Error in vectordb search endpoint:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid input", details: error.errors },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
