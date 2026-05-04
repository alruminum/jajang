import { z } from 'zod';

export const EntryStepSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('tap'),
    x: z.number().int().nonnegative(),
    y: z.number().int().nonnegative(),
    label: z.string().optional(),
  }),
  z.object({
    type: z.literal('tapTestId'),
    testId: z.string().min(1),
    label: z.string().optional(),
  }),
  z.object({
    type: z.literal('inputText'),
    text: z.string(),
  }),
  z.object({
    type: z.literal('keyevent'),
    code: z.union([z.string(), z.number()]),
  }),
  z.object({
    type: z.literal('permissionGrant'),
    permission: z.string().min(1),
  }),
  z.object({
    type: z.literal('deepLink'),
    uri: z.string().min(1),
  }),
  z.object({
    type: z.literal('wait'),
    ms: z.number().int().positive(),
  }),
]);

export const ScreenSchema = z.object({
  id: z.string().min(1),
  label: z.string().optional(),
  entrySteps: z.array(EntryStepSchema),
  settleMs: z.number().int().nonnegative().default(2000),
  pencilNodeIds: z.array(z.string()).optional(),
});

export const QaConfigSchema = z
  .object({
    appPackage: z.string().min(1),
    outputDir: z.string().default('./qa-output'),
    uxFlowAnchor: z.string().optional(),
    screens: z.array(ScreenSchema).optional(),
    screenRegistryPath: z.string().optional(),
    pencil: z
      .object({
        enabled: z.boolean().default(false),
        documentPath: z.string().optional(),
        nodeIds: z.record(z.string(), z.array(z.string())).optional(),
      })
      .optional(),
  })
  .refine(
    (c) => (c.screens && c.screens.length > 0) || !!c.screenRegistryPath,
    { message: 'screens (non-empty array) 또는 screenRegistryPath 중 하나는 필수' },
  );

export type EntryStep = z.infer<typeof EntryStepSchema>;
export type Screen = z.infer<typeof ScreenSchema>;
export type QaConfig = z.infer<typeof QaConfigSchema>;
