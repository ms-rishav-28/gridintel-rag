import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// CODEX-FIX: store runtime AI settings in Convex for durable frontend/backend configuration.
export const getSettings = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("settings").collect();
    return all[0] ?? null;
  },
});

export const saveSettings = mutation({
  args: {
    llmProvider: v.optional(v.string()),
    llmModel: v.optional(v.string()),
    embeddingModel: v.optional(v.string()),
    enableVision: v.optional(v.boolean()),
    enableBrowserIngestion: v.optional(v.boolean()),
    systemPromptOverride: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("settings").first();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { ...args, updatedAt: now });
      return existing._id;
    }
    return await ctx.db.insert("settings", { ...args, updatedAt: now });
  },
});
