import { z } from "zod";
import { PipelineStageSchema } from "@/lib/validations/pipelineStages.schema";

// ─── Base schemas (internal) ────────────────────────────────────────────────────
const DealOwnerSchema = z.object({
  id: z.string(),
  name: z.string(),
});

const DealContactCardSchema = z.object({
  id: z.string(),
  name: z.string(),
  company: z.string().nullable(),
  // GET /deals/board sends these; create/update responses may omit them.
  phone: z.string().nullish(),
  address: z.string().nullish(),
  city: z.string().nullish(),
});

// ─── Deal Card — used in pipeline view ────────────────────────────────────
export const DealCardSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  contactId: z.string(),
  ownerId: z.string(),
  title: z.string(),
  value: z.coerce.number(),
  // Legacy DealStage value, still dual-written by the backend (a custom stage
  // gives "PROSPECT"). Never use it for stage logic, use stageId.
  stage: z.string(),
  // Null only for an old deal the backend has not linked to a stage yet.
  stageId: z.string().nullable(),
  isPaid: z.boolean().default(false),
  // ISO string when the deal is archived manually, null otherwise. Responses
  // are not parsed at runtime, so it stays a string (check with != null).
  archivedAt: z.string().nullable(),
  closeDate: z.coerce.date(),
  note: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  contact: DealContactCardSchema,
  owner: DealOwnerSchema,
});

export type DealCard = z.infer<typeof DealCardSchema>;

// ─── Board Response — GET /deals/board ───────────────────────────────────────
// One column per tenant pipeline stage, in stage order. A deal belongs to the
// column it is listed in (the backend places a deal without stageId by its
// legacy stage), so take the stage from the column, not from the card.
export const BoardColumnStageSchema = PipelineStageSchema.pick({
  id: true,
  name: true,
  color: true,
  order: true,
  kind: true,
  probability: true,
});

export type BoardColumnStage = z.infer<typeof BoardColumnStageSchema>;

export const BoardColumnSchema = z.object({
  stage: BoardColumnStageSchema,
  deals: z.array(DealCardSchema),
});

export type BoardColumn = z.infer<typeof BoardColumnSchema>;

export const BoardResSchema = z.array(BoardColumnSchema);

export type BoardRes = z.infer<typeof BoardResSchema>;

// ─── Deal Detail — GET /deals/:id ─────────────────────────────────────────────
export const DealDetailSchema = DealCardSchema.extend({
  contact: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
    company: z.string().nullable(),
    position: z.string().nullable(),
    city: z.string().nullable(),
  }),
  owner: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
  }),
  tasks: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      done: z.boolean(),
      dueDate: z.coerce.date().nullable(),
      createdAt: z.coerce.date(),
      assigneeId: z.string().nullable(),
      assignee: z
        .object({
          id: z.string(),
          name: z.string(),
          email: z.string(),
        })
        .nullable(),
    }),
  ),
  activities: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      title: z.string().nullable(),
      note: z.string(),
      date: z.coerce.date(),
    }),
  ),
  aiSuggestions: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      content: z.string(),
      createdAt: z.coerce.date(),
    }),
  ),
});

export type DealDetail = z.infer<typeof DealDetailSchema>;

// ─── CREATE — POST /deals ─────────────────────────────────────────────────────
// NOTE: form-facing validation messages live in the component-local
// buildCreateDealSchema(tv) factory (CreateDealSheet). This schema is used
// only for its inferred type, so it carries no user-facing messages.
export const CreateDealBodySchema = z.object({
  title: z.string().min(1).max(200),
  contactId: z.string().min(1),
  ownerId: z.string().min(1),
  value: z.coerce.number().nonnegative().default(0),
  closeDate: z.coerce.date(),
  note: z.string().optional(),
  // PipelineStage id; without it the backend uses the first open stage.
  stageId: z.string().optional(),
});

export type CreateDealBodyType = z.infer<typeof CreateDealBodySchema>;

// ─── UPDATE — PATCH /deals/:id ────────────────────────────────────────────────
export const UpdateDealBodySchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    ownerId: z.string().optional(),
    value: z.coerce.number().nonnegative().optional(),
    closeDate: z.coerce.date().nullable().optional(),
    note: z.string().nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0);

export type UpdateDealBodyType = z.infer<typeof UpdateDealBodySchema>;

// ─── UPDATE STAGE — PATCH /deals/:id/stage ───────────────────────────────────
export const UpdateDealStageBodySchema = z.object({
  stageId: z.string(),
});

export type UpdateDealStageBodyType = z.infer<typeof UpdateDealStageBodySchema>;

// ─── UPDATE PAYMENT STATUS — PATCH /deals/:id/payment-status ─────────────────
export const UpdateDealPaymentStatusBodySchema = z.object({
  isPaid: z.boolean(),
});

export type UpdateDealPaymentStatusBodyType = z.infer<
  typeof UpdateDealPaymentStatusBodySchema
>;

// ─── ARCHIVE — POST /deals/archive, POST /deals/unarchive ────────────────────
export const ArchiveDealsResSchema = z.object({
  updated: z.number(),
});

export type ArchiveDealsRes = z.infer<typeof ArchiveDealsResSchema>;
