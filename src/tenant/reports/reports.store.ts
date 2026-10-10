export type ReportStatus =
  'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

export type ReportAppointment = {
  status: ReportStatus;
  priceAmountMinor: number;
  service: { id: string; name: string };
  staff: { id: string; name: string };
};

export type ReportGroup = {
  id: string;
  name: string;
  bookings: number;
  revenueAmountMinor: number;
};

export type ReportSummary = {
  currency: string;
  bookings: number;
  cancelled: number;
  noShows: number;
  revenueAmountMinor: number;
  advanced: boolean;
  byService: ReportGroup[];
  byStaff: ReportGroup[];
};

export interface ReportsStore {
  appointments(
    databaseName: string,
    from: Date,
    to: Date,
  ): Promise<ReportAppointment[]>;
}
