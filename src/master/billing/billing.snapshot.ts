export type BillingCard = {
  brand: string;
  last4: string;
};

type BillingInvoice = {
  id: string;
  number: string | null;
  status: string;
  amountMinor: number;
  currency: string;
  createdAt: Date;
  hostedUrl: string | null;
};

export type BillingSnapshot = {
  card: BillingCard | null;
  renewal: {
    amountMinor: number;
    currency: string;
    at: Date | null;
  } | null;
  invoices: BillingInvoice[];
};

export type BillingSnapshotRequest = {
  customerId: string;
  subscriptionId: string | null;
};
