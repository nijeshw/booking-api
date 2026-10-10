INSERT INTO "Plan" (
  "id",
  "name",
  "monthlyAmountMinor",
  "currency",
  "trialDays",
  "entitlements",
  "active"
) VALUES
  (
    'trial',
    'Free trial',
    0,
    'GBP',
    14,
    '{"maxStaff":null,"maxServices":null,"deposits":true,"onlinePayments":true,"multipleStaff":true,"advancedBookingSettings":true,"customerHistory":true,"reports":true,"advancedReports":true,"customBranding":true,"multipleLocations":true,"teamPermissions":true}'::jsonb,
    true
  ),
  (
    'starter',
    'Starter',
    1200,
    'GBP',
    0,
    '{"maxStaff":1,"maxServices":null,"deposits":false,"onlinePayments":false,"multipleStaff":false,"advancedBookingSettings":false,"customerHistory":true,"reports":false,"advancedReports":false,"customBranding":false,"multipleLocations":false,"teamPermissions":false}'::jsonb,
    true
  ),
  (
    'pro',
    'Pro',
    2900,
    'GBP',
    0,
    '{"maxStaff":10,"maxServices":null,"deposits":true,"onlinePayments":true,"multipleStaff":true,"advancedBookingSettings":true,"customerHistory":true,"reports":true,"advancedReports":false,"customBranding":true,"multipleLocations":false,"teamPermissions":false}'::jsonb,
    true
  ),
  (
    'business',
    'Business',
    4900,
    'GBP',
    0,
    '{"maxStaff":50,"maxServices":null,"deposits":true,"onlinePayments":true,"multipleStaff":true,"advancedBookingSettings":true,"customerHistory":true,"reports":true,"advancedReports":true,"customBranding":true,"multipleLocations":true,"teamPermissions":true}'::jsonb,
    true
  )
ON CONFLICT ("id") DO UPDATE SET
  "name" = EXCLUDED."name",
  "monthlyAmountMinor" = EXCLUDED."monthlyAmountMinor",
  "currency" = EXCLUDED."currency",
  "trialDays" = EXCLUDED."trialDays",
  "entitlements" = EXCLUDED."entitlements",
  "active" = EXCLUDED."active";
