import { z } from 'zod';

export const settingsPatchSchema = z.object({
  values: z.record(
    z.string(),
    z.union([z.boolean(), z.number(), z.string()]),
  ),
});

export type SettingsPatch = z.infer<typeof settingsPatchSchema>;
