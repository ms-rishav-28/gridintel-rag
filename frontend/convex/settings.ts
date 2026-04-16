import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const DEFAULT_SETTINGS = {
  theme: "light",
  notifications: {
    critical: true,
    insights: true,
  },
  profile: {
    name: "Grid Engineer",
    designation: "Field Analyst",
    email: "engineer@powergrid.local",
  },
};

export const upsertSettings = mutation({
  args: {
    theme: v.optional(v.string()),
    notifications: v.optional(
      v.object({
        critical: v.boolean(),
        insights: v.boolean(),
      }),
    ),
    profile: v.optional(
      v.object({
        name: v.optional(v.string()),
        designation: v.optional(v.string()),
        email: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", "global"))
      .unique();

    const payload = {
      key: "global",
      theme: args.theme,
      notifications: args.notifications,
      profile: args.profile,
      updated_at: new Date().toISOString(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return { status: "updated" };
    }

    await ctx.db.insert("settings", payload);
    return { status: "created" };
  },
});

export const getSettings = query({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", "global"))
      .unique();

    if (!existing) {
      return DEFAULT_SETTINGS;
    }

    return {
      theme: existing.theme ?? DEFAULT_SETTINGS.theme,
      notifications: existing.notifications ?? DEFAULT_SETTINGS.notifications,
      profile: {
        ...DEFAULT_SETTINGS.profile,
        ...(existing.profile ?? {}),
      },
    };
  },
});
