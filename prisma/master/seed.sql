INSERT INTO "Plan" (
  "id",
  "name",
  "monthlyAmountMinor",
  "currency",
  "trialDays",
  "entitlements",
  "stripePriceId",
  "active"
) VALUES
  (
    'trial',
    'Free trial',
    0,
    'GBP',
    14,
    '{"maxStaff":null,"maxServices":null,"deposits":true,"onlinePayments":true,"multipleStaff":true,"advancedBookingSettings":true,"customerHistory":true,"reports":true,"advancedReports":true,"customBranding":true,"multipleLocations":true,"teamPermissions":true}'::jsonb,
    NULL,
    true
  ),
  (
    'starter',
    'Starter',
    1200,
    'GBP',
    0,
    '{"maxStaff":1,"maxServices":null,"deposits":false,"onlinePayments":false,"multipleStaff":false,"advancedBookingSettings":false,"customerHistory":true,"reports":false,"advancedReports":false,"customBranding":false,"multipleLocations":false,"teamPermissions":false}'::jsonb,
    NULL,
    true
  ),
  (
    'pro',
    'Pro',
    2900,
    'GBP',
    0,
    '{"maxStaff":10,"maxServices":null,"deposits":true,"onlinePayments":true,"multipleStaff":true,"advancedBookingSettings":true,"customerHistory":true,"reports":true,"advancedReports":false,"customBranding":true,"multipleLocations":false,"teamPermissions":false}'::jsonb,
    NULL,
    true
  ),
  (
    'business',
    'Business',
    4900,
    'GBP',
    0,
    '{"maxStaff":50,"maxServices":null,"deposits":true,"onlinePayments":true,"multipleStaff":true,"advancedBookingSettings":true,"customerHistory":true,"reports":true,"advancedReports":true,"customBranding":true,"multipleLocations":true,"teamPermissions":true}'::jsonb,
    NULL,
    true
  ),
  (
    'basic',
    'Basic',
    1500,
    'GBP',
    0,
    '{"maxStaff":1,"maxServices":null,"deposits":false,"onlinePayments":false,"multipleStaff":false,"advancedBookingSettings":false,"customerHistory":true,"reports":false,"advancedReports":false,"customBranding":false,"multipleLocations":false,"teamPermissions":false}'::jsonb,
    'price_1UP6lGBSjJ2SICK3z4ttOjVS',
    true
  )
ON CONFLICT ("id") DO UPDATE SET
  "name" = EXCLUDED."name",
  "monthlyAmountMinor" = EXCLUDED."monthlyAmountMinor",
  "currency" = EXCLUDED."currency",
  "trialDays" = EXCLUDED."trialDays",
  "entitlements" = EXCLUDED."entitlements",
  "active" = EXCLUDED."active",
  "stripePriceId" = COALESCE(EXCLUDED."stripePriceId", "Plan"."stripePriceId");
