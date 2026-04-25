import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// CODEX-FIX: expose document metadata and Convex File Storage operations for backend ingestion.
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const createDocument = mutation({
  args: {
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
    sha256: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("documents", {
      ...args,
      ingestionStatus: "pending",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateDocument = mutation({
  args: {
    docId: v.string(),
    ingestionStatus: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("processing"),
        v.literal("done"),
        v.literal("failed"),
      ),
    ),
    storageId: v.optional(v.id("_storage")),
    chunkCount: v.optional(v.number()),
    imageCount: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
    progressMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { docId, progressMessage, ...updates } = args;
    void progressMessage;
    const doc = await ctx.db
      .query("documents")
      .withIndex("by_doc_id", (q) => q.eq("docId", docId))
      .unique();
    if (!doc) throw new Error(`Document ${docId} not found`);
    await ctx.db.patch(doc._id, { ...updates, updatedAt: Date.now() });
    return doc._id;
  },
});

export const deleteDocument = mutation({
  args: { docId: v.string() },
  handler: async (ctx, args) => {
    const doc = await ctx.db
      .query("documents")
      .withIndex("by_doc_id", (q) => q.eq("docId", args.docId))
      .unique();
    if (!doc) return null;
    if (doc.storageId) {
      await ctx.storage.delete(doc.storageId);
    }
    await ctx.db.delete(doc._id);
    return doc._id;
  },
});

export const getDocumentByHash = query({
  args: { sha256: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("documents")
      .withIndex("by_sha256", (q) => q.eq("sha256", args.sha256))
      .unique();
  },
});

export const listDocuments = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("documents").order("desc").collect();
  },
});

export const getDocumentDownloadUrl = query({
  args: { docId: v.string() },
  handler: async (ctx, args) => {
    const doc = await ctx.db
      .query("documents")
      .withIndex("by_doc_id", (q) => q.eq("docId", args.docId))
      .unique();
    if (!doc || !doc.storageId) return null;
    return await ctx.storage.getUrl(doc.storageId);
  },
});
