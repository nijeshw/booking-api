import { subscriptionLocksApp } from './billing-lock';

describe('subscriptionLocksApp', () => {
  it('locks an overdue or unpaid subscription', () => {
    expect(subscriptionLocksApp('PAST_DUE')).toBe(true);
    expect(subscriptionLocksApp('UNPAID')).toBe(true);
  });

  it('leaves a current, trial, or cancelled subscription open', () => {
    expect(subscriptionLocksApp('ACTIVE')).toBe(false);
    expect(subscriptionLocksApp('TRIALING')).toBe(false);
    expect(subscriptionLocksApp('CANCELED')).toBe(false);
    expect(subscriptionLocksApp('INCOMPLETE')).toBe(false);
    expect(subscriptionLocksApp(null)).toBe(false);
  });
});
