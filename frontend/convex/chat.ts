import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const saveMessage = mutation({
  args: {
    session_id: v.string(),
    role: v.string(),
    content: v.string(),
    timestamp: v.optional(v.string()),
    citations: v.optional(v.array(v.any())),
    confidence: v.optional(v.number()),
    model_used: v.optional(v.string()),
    query_time_ms: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const timestamp = args.timestamp ?? new Date().toISOString();

    await ctx.db.insert("chat_messages", {
      session_id: args.session_id,
      role: args.role,
      content: args.content,
      timestamp,
      citations: args.citations,
      confidence: args.confidence,
      model_used: args.model_used,
      query_time_ms: args.query_time_ms,
    });

    const session = await ctx.db
      .query("chat_sessions")
      .withIndex("by_session_id", (q) => q.eq("session_id", args.session_id))
      .unique();

    if (session) {
      await ctx.db.patch(session._id, {
        updated_at: timestamp,
        message_count: session.message_count + 1,
      });
    } else {
      await ctx.db.insert("chat_sessions", {
        session_id: args.session_id,
        created_at: timestamp,
        updated_at: timestamp,
        message_count: 1,
      });
    }

    return { status: "ok", session_id: args.session_id };
  },
});

export const getSession = query({
  args: { session_id: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("chat_sessions")
      .withIndex("by_session_id", (q) => q.eq("session_id", args.session_id))
      .unique();

    const messages = await ctx.db
      .query("chat_messages")
      .withIndex("by_session_id", (q) => q.eq("session_id", args.session_id))
      .collect();

    const sorted = messages.sort((a, b) => (a.timestamp > b.timestamp ? 1 : -1));

    return {
      session_id: args.session_id,
      created_at: session?.created_at,
      updated_at: session?.updated_at,
      messages: sorted.map((msg) => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
        citations: msg.citations ?? [],
        confidence: msg.confidence,
        model_used: msg.model_used,
        query_time_ms: msg.query_time_ms,
      })),
    };
  },
});

export const listSessions = query({
  args: {},
  handler: async (ctx) => {
    const sessions = await ctx.db.query("chat_sessions").collect();

    return sessions
      .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))
      .slice(0, 50)
      .map((session) => ({
        session_id: session.session_id,
        created_at: session.created_at,
        updated_at: session.updated_at,
        message_count: session.message_count,
      }));
  },
});

export const listRecentMessages = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const maxResults = Math.min(Math.max(args.limit ?? 20, 1), 100);
    const messages = await ctx.db.query("chat_messages").collect();

    return messages
      .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
      .slice(0, maxResults)
      .map((msg) => ({
        session_id: msg.session_id,
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
        citations: msg.citations ?? [],
        confidence: msg.confidence,
        model_used: msg.model_used,
        query_time_ms: msg.query_time_ms,
      }));
  },
});
