import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// CODEX-FIX: add durable Convex schema for chat, documents, jobs, settings, and file storage IDs.
export default defineSchema({
  chatSessions: defineTable({
    title: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    messageCount: v.number(),
    userId: v.optional(v.string()),
  })
    .index("by_updated", ["updatedAt"])
    .index("by_user", ["userId"]),

  chatMessages: defineTable({
    sessionId: v.id("chatSessions"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    citations: v.optional(
      v.array(
        v.object({
          docId: v.string(),
          docName: v.string(),
          pageNumber: v.optional(v.number()),
          chunkIndex: v.optional(v.number()),
          relevanceScore: v.optional(v.number()),
          chunkPreview: v.optional(v.string()),
          isImageChunk: v.optional(v.boolean()),
        }),
      ),
    ),
    llmProvider: v.optional(v.string()),
    durationMs: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_session_created", ["sessionId", "createdAt"]),

  documents: defineTable({
    docId: v.string(),
    name: v.string(),
    sourceType: v.union(
      v.literal("pdf"),
      v.literal("docx"),
      v.literal("txt"),
      v.literal("webpage"),
    ),
    sourceUrl: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    fileSizeBytes: v.optional(v.number()),
    chunkCount: v.optional(v.number()),
    imageCount: v.optional(v.number()),
    sha256: v.optional(v.string()),
    ingestionStatus: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("done"),
      v.literal("failed"),
    ),
    errorMessage: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_doc_id", ["docId"])
    .index("by_status", ["ingestionStatus"])
    .index("by_sha256", ["sha256"]),

  ingestionJobs: defineTable({
    jobId: v.string(),
    docId: v.optional(v.string()),
    sourceType: v.string(),
    sourceUrl: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("done"),
      v.literal("failed"),
    ),
    progressMessage: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    totalChunks: v.optional(v.number()),
    processedChunks: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_job_id", ["jobId"])
    .index("by_status", ["status"]),

  settings: defineTable({
    userId: v.optional(v.string()),
    llmProvider: v.optional(v.string()),
    llmModel: v.optional(v.string()),
    embeddingModel: v.optional(v.string()),
    enableVision: v.optional(v.boolean()),
    enableBrowserIngestion: v.optional(v.boolean()),
    systemPromptOverride: v.optional(v.string()),
    updatedAt: v.number(),
  }),
});
