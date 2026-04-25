import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// CODEX-FIX: persist chat sessions/messages in Convex so history survives backend restarts.
export const createSession = mutation({
  args: { title: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("chatSessions", {
      title: args.title ?? "New Chat",
      createdAt: now,
      updatedAt: now,
      messageCount: 0,
    });
  },
});

export const listSessions = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("chatSessions")
      .withIndex("by_updated")
      .order("desc")
      .take(50);
  },
});

export const appendMessage = mutation({
  args: {
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
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const msgId = await ctx.db.insert("chatMessages", {
      ...args,
      createdAt: now,
    });
    const session = await ctx.db.get(args.sessionId);
    if (session) {
      await ctx.db.patch(args.sessionId, {
        updatedAt: now,
        messageCount: (session.messageCount ?? 0) + 1,
        title:
          args.role === "user" && session.messageCount === 0
            ? args.content.slice(0, 60)
            : session.title,
      });
    }
    return msgId;
  },
});

export const getMessages = query({
  args: {
    sessionId: v.id("chatSessions"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("chatMessages")
      .withIndex("by_session_created", (q) => q.eq("sessionId", args.sessionId))
      .order("asc")
      .paginate(args.paginationOpts);
  },
});

export const getLastNMessages = query({
  args: { sessionId: v.id("chatSessions"), n: v.number() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("chatMessages")
      .withIndex("by_session_created", (q) => q.eq("sessionId", args.sessionId))
      .order("desc")
      .take(args.n);
  },
});

export const deleteSession = mutation({
  args: { sessionId: v.id("chatSessions") },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("chatMessages")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();
    for (const msg of messages) {
      await ctx.db.delete(msg._id);
    }
    await ctx.db.delete(args.sessionId);
  },
});
