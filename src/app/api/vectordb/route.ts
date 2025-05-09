import { NextResponse } from "next/server";
import { z } from "zod";

import { appRouter } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";

// Input validation schema
const inputSchema = z.object({
  text: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    // Parse request body
    const body = await req.json();

    // Validate input
    const { text } = inputSchema.parse(body);

    // Create context and caller
    const ctx = await createTRPCContext({ headers: req.headers });
    const caller = appRouter.createCaller(ctx);

    // Add to vector DB
    const result = await caller.post.addToVectorDB({ text });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error in vectordb endpoint:", error);

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
