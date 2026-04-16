import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const upsertMetadata = mutation({
  args: {
    doc_id: v.string(),
    filename: v.string(),
    doc_type: v.string(),
    equipment_type: v.optional(v.string()),
    voltage_level: v.optional(v.string()),
    chunks_count: v.number(),
    file_hash: v.optional(v.string()),
    file_size: v.optional(v.number()),
    uploaded_at: v.optional(v.string()),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("documents")
      .withIndex("by_doc_id", (q) => q.eq("doc_id", args.doc_id))
      .unique();

    const now = new Date().toISOString();
    const status = args.status ?? "active";

    if (existing) {
      await ctx.db.patch(existing._id, {
        filename: args.filename,
        doc_type: args.doc_type,
        equipment_type: args.equipment_type,
        voltage_level: args.voltage_level,
        chunks_count: args.chunks_count,
        file_hash: args.file_hash,
        file_size: args.file_size,
        status,
        updated_at: now,
      });
      return { status: "updated", doc_id: args.doc_id };
    }

    await ctx.db.insert("documents", {
      doc_id: args.doc_id,
      filename: args.filename,
      doc_type: args.doc_type,
      equipment_type: args.equipment_type,
      voltage_level: args.voltage_level,
      chunks_count: args.chunks_count,
      file_hash: args.file_hash,
      file_size: args.file_size,
      uploaded_at: args.uploaded_at ?? now,
      updated_at: now,
      status,
    });

    return { status: "created", doc_id: args.doc_id };
  },
});

export const listActive = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("documents")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    return rows
      .sort((a, b) => (a.uploaded_at < b.uploaded_at ? 1 : -1))
      .map((row) => ({
        doc_id: row.doc_id,
        filename: row.filename,
        doc_type: row.doc_type,
        equipment_type: row.equipment_type,
        voltage_level: row.voltage_level,
        chunks_count: row.chunks_count,
        file_hash: row.file_hash,
        file_size: row.file_size,
        uploaded_at: row.uploaded_at,
        status: row.status,
      }));
  },
});

export const softDeleteDocument = mutation({
  args: { doc_id: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("documents")
      .withIndex("by_doc_id", (q) => q.eq("doc_id", args.doc_id))
      .unique();

    if (!existing) {
      return { status: "not_found", doc_id: args.doc_id };
    }

    await ctx.db.patch(existing._id, {
      status: "deleted",
      updated_at: new Date().toISOString(),
    });

    return { status: "deleted", doc_id: args.doc_id };
  },
});
