import { QdrantClient } from "@qdrant/js-client-rest";
import OpenAI from "openai";
import { z } from "zod";
import { randomUUID } from "crypto";

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
const VECTOR_SIZE = 1536; // text-embedding-3-small dimensions

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

// Initialize collection with proper configuration
async function initCollection() {
  console.log("Initializing collection...");

  try {
    // Create new collection
    console.log("Creating new collection with size:", VECTOR_SIZE);
    await qdrantClient.createCollection(COLLECTION_NAME, {
      vectors: {
        size: VECTOR_SIZE,
        distance: "Cosine",
      },
      optimizers_config: {
        default_segment_number: 2,
      },
    });
    console.log("Collection created successfully");

    // Create payload index
    console.log("Creating payload index...");
    await qdrantClient.createPayloadIndex(COLLECTION_NAME, {
      field_name: "text",
      field_schema: "keyword",
      wait: true,
    });
    console.log("Payload index created successfully");

    // Verify collection exists and is configured correctly
    const collection = await qdrantClient.getCollection(COLLECTION_NAME);
    console.log("Collection verification:", collection);
  } catch (error) {
    console.error("Failed to initialize collection:", error);
    throw new Error(
      `Collection initialization failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

// Initialize collection on startup and handle any errors
void initCollection().catch((error) => {
  console.error("Failed to initialize collection on startup:", error);
});

export const postRouter = createTRPCRouter({
  addToVectorDB: publicProcedure
    .input(z.object({ text: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const embedding = await getEmbedding(input.text);
      // Debug: Check if collection exists
      const collections = await qdrantClient.getCollections();
      console.log("Available collections:", collections.collections);

      const collection = await qdrantClient.getCollection(COLLECTION_NAME);
      console.log("Collection info:", collection);

      try {
        // Log the point we're trying to insert
        const point = {
          id: randomUUID(),
          vector: embedding,
          payload: {
            text: input.text,
            timestamp: new Date().toISOString(),
          },
        };
        console.log("Attempting to insert point:", point);

        // Attempt upsert
        const upsertResult = await qdrantClient.upsert(COLLECTION_NAME, {
          wait: true,
          points: [point],
        });

        console.log("Upsert result:", upsertResult);
        return { success: true, point_id: point.id };
      } catch (error) {
        console.error("Upsert error:", error);
        throw new Error(
          `Failed to insert vector: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
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
