import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  documents: defineTable({
    doc_id: v.string(),
    filename: v.string(),
    doc_type: v.string(),
    equipment_type: v.optional(v.string()),
    voltage_level: v.optional(v.string()),
    chunks_count: v.number(),
    file_hash: v.optional(v.string()),
    file_size: v.optional(v.number()),
    uploaded_at: v.string(),
    updated_at: v.optional(v.string()),
    status: v.string(),
  })
    .index("by_doc_id", ["doc_id"])
    .index("by_status", ["status"]),

  chat_sessions: defineTable({
    session_id: v.string(),
    created_at: v.string(),
    updated_at: v.string(),
    message_count: v.number(),
  }).index("by_session_id", ["session_id"]),

  chat_messages: defineTable({
    session_id: v.string(),
    role: v.string(),
    content: v.string(),
    timestamp: v.string(),
    citations: v.optional(v.array(v.any())),
    confidence: v.optional(v.number()),
    model_used: v.optional(v.string()),
    provider: v.optional(v.string()),
    query_time_ms: v.optional(v.number()),
    documents_retrieved: v.optional(v.number()),
    is_insufficient: v.optional(v.boolean()),
  })
    .index("by_session_id", ["session_id"])
    .index("by_session_timestamp", ["session_id", "timestamp"]),

  settings: defineTable({
    key: v.string(),
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
    updated_at: v.string(),
  }).index("by_key", ["key"]),
});
