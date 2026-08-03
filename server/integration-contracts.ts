import { z } from "zod";

const requiredId = z.string().trim().min(1).max(200);
const requiredText = z.string().trim().min(1);
const moneyMinor = z.number().int().nonnegative();

export const approvedChangeTaskSchema = z.object({
  task_id: requiredId,
  title: requiredText,
  instructions: requiredText,
  quantity: z.number().positive().finite(),
  unit: requiredText,
  approved_amount_minor: moneyMinor,
}).strict();

export const approvedChangeOrderSchema = z.object({
  schema_version: z.literal(1),
  event_id: requiredId,
  event_type: z.literal("change_order.approved"),
  producer: z.literal("jarvis"),
  correlation_id: requiredId,
  occurred_at: z.string().datetime({ offset: true }),
  change_order_id: requiredId,
  revision: z.number().int().positive(),
  project_integration_id: requiredId,
  title: requiredText,
  scope: requiredText,
  approval_status: z.literal("approved"),
  approved_at: z.string().datetime({ offset: true }),
  approved_by_actor_id: requiredId,
  currency: z.string().regex(/^[A-Z]{3}$/, "Currency must be a three-letter uppercase code"),
  approved_amount_minor: moneyMinor,
  tasks: z.array(approvedChangeTaskSchema).min(1),
}).strict().superRefine((value, context) => {
  const taskIds = new Set<string>();
  value.tasks.forEach((task, index) => {
    if (taskIds.has(task.task_id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Task IDs must be unique",
        path: ["tasks", index, "task_id"],
      });
    }
    taskIds.add(task.task_id);
  });
});

export type ApprovedChangeTask = z.infer<typeof approvedChangeTaskSchema>;
export type ApprovedChangeOrder = z.infer<typeof approvedChangeOrderSchema>;

export function parseApprovedChangeOrder(input: unknown): ApprovedChangeOrder {
  return approvedChangeOrderSchema.parse(input);
}

export function validateApprovedChangeOrder(input: unknown) {
  return approvedChangeOrderSchema.safeParse(input);
}

export function validateIdempotencyKey(
  idempotencyKey: string | undefined,
  eventId: string,
): boolean {
  if (typeof idempotencyKey !== "string") return false;
  return (
    idempotencyKey.length > 0 &&
    idempotencyKey.length <= 200 &&
    idempotencyKey === idempotencyKey.trim() &&
    idempotencyKey === eventId
  );
}
