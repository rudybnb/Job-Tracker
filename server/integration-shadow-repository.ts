import type {
  ApprovedChangeOrder,
  ApprovedChangeTask,
} from "./integration-contracts.ts";

export type ShadowReceiptStatus = "accepted" | "duplicate" | "rejected";

export type ShadowRejectionCode =
  | "authentication_failed"
  | "invalid_json"
  | "invalid_contract"
  | "invalid_idempotency_key"
  | "event_payload_conflict"
  | "change_order_revision_conflict"
  | "repository_error";

export interface ShadowReceipt {
  readonly receipt_id: string;
  readonly event_id: string;
  readonly correlation_id: string;
  readonly change_order_id: string;
  readonly revision: number;
  readonly project_integration_id: string;
  readonly payload_sha256: string;
  readonly received_at: string;
  readonly status: ShadowReceiptStatus;
  readonly rejection_code?: ShadowRejectionCode;
}

export type ApprovedChangeSnapshot = Readonly<
  Omit<ApprovedChangeOrder, "tasks"> & {
    tasks: readonly Readonly<ApprovedChangeTask>[];
  }
>;

export interface StoreAcceptedShadowChange {
  readonly producer: string;
  readonly receipt: ShadowReceipt;
  readonly snapshot: ApprovedChangeSnapshot;
}

export type StoreAcceptedShadowChangeResult =
  | { readonly outcome: "stored" }
  | { readonly outcome: "event_exists"; readonly receipt: ShadowReceipt }
  | { readonly outcome: "revision_exists" };

export interface IntegrationShadowRepository {
  findEventReceipt(producer: string, eventId: string): Promise<ShadowReceipt | undefined>;
  findChangeOrderRevision(
    producer: string,
    changeOrderId: string,
    revision: number,
  ): Promise<ShadowReceipt | undefined>;
  // Implementations must atomically enforce both event and change-order revision uniqueness.
  storeAcceptedChange(
    change: StoreAcceptedShadowChange,
  ): Promise<StoreAcceptedShadowChangeResult>;
}
