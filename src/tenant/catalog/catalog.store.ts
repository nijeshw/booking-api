import type { HourRange } from '../hours/hours';
import type {
  BrandingInput,
  OnboardingInput,
  ServiceInput,
  StaffInput,
} from './catalog.schema';

export type ServiceView = {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  priceAmountMinor: number;
  currency: string;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  active: boolean;
};

export type StaffView = {
  id: string;
  userId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  active: boolean;
  serviceIds: string[];
};

export type TimeOffView = {
  id: string;
  staffId: string | null;
  startsAt: Date;
  endsAt: Date;
  reason: string | null;
};

export type Workspace = {
  onboarded: true;
  profile: {
    name: string;
    category: string;
    locationType: 'PHYSICAL' | 'MOBILE' | 'ONLINE';
    email: string | null;
    phone: string | null;
    website: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    postcode: string | null;
    country: string;
    timezone: string;
    currency: string;
    slug: string;
    description: string | null;
    logoUrl: string | null;
    brandColor: string | null;
  };
  policy: {
    minNoticeMinutes: number;
    maxAdvanceDays: number;
    cancellationWindowMinutes: number;
    allowCustomerCancel: boolean;
    allowCustomerReschedule: boolean;
    slotIntervalMinutes: number;
  };
  services: ServiceView[];
  staff: StaffView[];
  hours: HourRange[];
  staffHours: { staffId: string; hours: HourRange[] }[];
  timeOff: TimeOffView[];
};

export type OnboardingOwner = {
  userId: string;
  name: string;
  email: string;
};

export interface CatalogStore {
  workspace(databaseName: string): Promise<Workspace | null>;
  saveOnboarding(
    databaseName: string,
    input: OnboardingInput,
    owner: OnboardingOwner,
    slug: string,
  ): Promise<'ok' | 'exists'>;
  countServices(databaseName: string): Promise<number>;
  createService(
    databaseName: string,
    input: ServiceInput,
  ): Promise<ServiceView>;
  updateService(
    databaseName: string,
    id: string,
    input: Partial<ServiceInput>,
  ): Promise<ServiceView | null>;
  deleteService(
    databaseName: string,
    id: string,
  ): Promise<'ok' | 'missing' | 'in-use'>;
  countStaff(databaseName: string): Promise<number>;
  createStaff(
    databaseName: string,
    input: StaffInput & { userId?: string },
  ): Promise<StaffView | 'missing-service'>;
  updateStaff(
    databaseName: string,
    id: string,
    input: Partial<Omit<StaffInput, 'serviceIds'>> & { active?: boolean },
  ): Promise<StaffView | null>;
  deleteStaff(
    databaseName: string,
    id: string,
  ): Promise<'ok' | 'missing' | 'in-use'>;
  replaceStaffServices(
    databaseName: string,
    staffId: string,
    serviceIds: string[],
  ): Promise<'ok' | 'missing'>;
  replaceHours(
    databaseName: string,
    staffId: string | null,
    hours: HourRange[],
  ): Promise<'ok' | 'missing-staff'>;
  addTimeOff(
    databaseName: string,
    input: {
      staffId: string | null;
      startsAt: Date;
      endsAt: Date;
      reason: string | null;
    },
  ): Promise<TimeOffView | 'missing-staff'>;
  deleteTimeOff(databaseName: string, id: string): Promise<boolean>;
  updateBranding(
    databaseName: string,
    input: BrandingInput,
  ): Promise<Workspace | null>;
}
