import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// CODEX-FIX: track ingestion jobs in Convex so uploads can be polled across restarts.
export const createJob = mutation({
  args: {
    jobId: v.string(),
    docId: v.optional(v.string()),
    sourceType: v.string(),
    sourceUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("ingestionJobs", {
      ...args,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateJob = mutation({
  args: {
    jobId: v.string(),
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("processing"),
        v.literal("done"),
        v.literal("failed"),
      ),
    ),
    progressMessage: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    totalChunks: v.optional(v.number()),
    processedChunks: v.optional(v.number()),
    docId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { jobId, ...updates } = args;
    const job = await ctx.db
      .query("ingestionJobs")
      .withIndex("by_job_id", (q) => q.eq("jobId", jobId))
      .unique();
    if (!job) throw new Error(`Job ${jobId} not found`);
    await ctx.db.patch(job._id, { ...updates, updatedAt: Date.now() });
  },
});

export const getJob = query({
  args: { jobId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("ingestionJobs")
      .withIndex("by_job_id", (q) => q.eq("jobId", args.jobId))
      .unique();
  },
});
