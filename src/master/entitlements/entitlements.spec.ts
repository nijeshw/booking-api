import { allows, parseEntitlements, withinLimit } from './entitlements';

const starter = {
  maxStaff: 1,
  maxServices: null,
  deposits: false,
  onlinePayments: false,
  multipleStaff: false,
  advancedBookingSettings: false,
  customerHistory: true,
  reports: false,
  advancedReports: false,
  customBranding: false,
  multipleLocations: false,
  teamPermissions: false,
};

describe('entitlements', () => {
  it('rejects unknown plan capabilities', () => {
    expect(() => parseEntitlements({ ...starter, sms: true })).toThrow();
  });

  it('checks a capability without comparing plan names', () => {
    const entitlements = parseEntitlements(starter);
    expect(allows(entitlements, 'deposits')).toBe(false);
    expect(allows(entitlements, 'customerHistory')).toBe(true);
  });

  it('treats a null limit as uncapped', () => {
    const entitlements = parseEntitlements(starter);
    expect(withinLimit(entitlements, 'maxStaff', 1)).toBe(false);
    expect(withinLimit(entitlements, 'maxServices', 100)).toBe(true);
  });
});
