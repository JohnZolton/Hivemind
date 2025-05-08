import { QdrantClient } from "@qdrant/js-client-rest";
import OpenAI from "openai";
import { z } from "zod";

import { env } from "~/env";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

const qdrantClient = new QdrantClient({
  host: env.Qdrant_url,
  apiKey: env.Qdrant_key,
});

const openai = new OpenAI({
  apiKey: env.OpenAI_key,
});

const COLLECTION_NAME = "Hivemind";
const VECTOR_SIZE = 384; // text-embeddings-3-small dimensions

async function getEmbedding(text: string) {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
    encoding_format: "float",
  });

  if (!response.data[0]?.embedding) {
    throw new Error("Failed to generate embedding");
  }

  return response.data[0].embedding;
}

// Initialize collection if it doesn't exist
async function initCollection() {
  try {
    await qdrantClient.getCollection(COLLECTION_NAME);
  } catch {
    await qdrantClient.createCollection(COLLECTION_NAME, {
      vectors: {
        size: VECTOR_SIZE,
        distance: "Cosine",
      },
    });
  }
}

void initCollection();

export const postRouter = createTRPCRouter({
  addToVectorDB: publicProcedure
    .input(z.object({ text: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const embedding = await getEmbedding(input.text);

      await qdrantClient.upsert(COLLECTION_NAME, {
        points: [
          {
            id: Date.now().toString(),
            vector: embedding,
            payload: {
              text: input.text,
            },
          },
        ],
      });

      return { success: true };
    }),

  searchVectorDB: publicProcedure
    .input(
      z.object({
        text: z.string().min(1),
        limit: z.number().min(1).default(5),
      }),
    )
    .query(async ({ input }) => {
      const embedding = await getEmbedding(input.text);

      const results = await qdrantClient.search(COLLECTION_NAME, {
        vector: embedding,
        limit: input.limit,
        with_payload: true,
      });

      return results.map((hit) => ({
        score: hit.score,
        text: hit.payload?.text as string,
      }));
    }),
});
