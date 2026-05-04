import { describe, it, expect } from 'vitest';
import { QaConfigSchema, EntryStepSchema, ScreenSchema } from '../schema';

describe('REQ-001 REQ-002 QaConfigSchema / EntryStepSchema / ScreenSchema', () => {
  // REQ-001: screens / screenRegistryPath 둘 다 없으면 refine fail
  describe('QaConfigSchema — refine 검증', () => {
    it('screens 와 screenRegistryPath 둘 다 없으면 parse fail', () => {
      const result = QaConfigSchema.safeParse({ appPackage: 'com.x' });
      expect(result.success).toBe(false);
      const issues = (result as any).error.issues;
      expect(issues.some((i: any) => /screenRegistryPath/.test(i.message))).toBe(true);
    });

    it('screens 가 빈 배열이면 refine fail', () => {
      const result = QaConfigSchema.safeParse({ appPackage: 'com.x', screens: [] });
      expect(result.success).toBe(false);
    });

    it('screens 에 유효 항목이 있으면 parse success', () => {
      const result = QaConfigSchema.safeParse({
        appPackage: 'com.x',
        screens: [{ id: 'Home', entrySteps: [] }],
      });
      expect(result.success).toBe(true);
    });

    it('parse success 시 outputDir 기본값은 ./qa-output', () => {
      const result = QaConfigSchema.safeParse({
        appPackage: 'com.x',
        screens: [{ id: 'Home', entrySteps: [] }],
      });
      expect(result.success).toBe(true);
      expect((result as any).data.outputDir).toBe('./qa-output');
    });

    it('screenRegistryPath 만 있으면 parse success', () => {
      const result = QaConfigSchema.safeParse({
        appPackage: 'com.x',
        screenRegistryPath: './registry.json',
      });
      expect(result.success).toBe(true);
    });
  });

  // ScreenSchema defaults
  describe('ScreenSchema — settleMs 기본값', () => {
    it('settleMs 미지정 시 기본값 2000', () => {
      const result = ScreenSchema.safeParse({ id: 'Home', entrySteps: [] });
      expect(result.success).toBe(true);
      expect((result as any).data.settleMs).toBe(2000);
    });
  });

  // REQ-002: EntryStepSchema discriminatedUnion 7 variants
  describe('EntryStepSchema — valid variants', () => {
    it('type: tap 유효 입력 parse success', () => {
      const result = EntryStepSchema.safeParse({ type: 'tap', x: 100, y: 200 });
      expect(result.success).toBe(true);
    });

    it('type: tap — x 가 음수이면 fail', () => {
      const result = EntryStepSchema.safeParse({ type: 'tap', x: -1, y: 200 });
      expect(result.success).toBe(false);
    });

    it('type: tapTestId 유효 입력 parse success', () => {
      const result = EntryStepSchema.safeParse({ type: 'tapTestId', testId: 'btn-home' });
      expect(result.success).toBe(true);
    });

    it('type: inputText 유효 입력 parse success', () => {
      const result = EntryStepSchema.safeParse({ type: 'inputText', text: 'hello' });
      expect(result.success).toBe(true);
    });

    it('type: keyevent — string 코드 허용', () => {
      const result = EntryStepSchema.safeParse({ type: 'keyevent', code: 'BACK' });
      expect(result.success).toBe(true);
    });

    it('type: keyevent — number 코드 허용', () => {
      const result = EntryStepSchema.safeParse({ type: 'keyevent', code: 4 });
      expect(result.success).toBe(true);
    });

    it('type: permissionGrant 유효 입력 parse success', () => {
      const result = EntryStepSchema.safeParse({
        type: 'permissionGrant',
        permission: 'android.permission.RECORD_AUDIO',
      });
      expect(result.success).toBe(true);
    });

    it('type: deepLink 유효 입력 parse success', () => {
      const result = EntryStepSchema.safeParse({ type: 'deepLink', uri: 'jajang://home' });
      expect(result.success).toBe(true);
    });

    it('type: wait 유효 입력 parse success', () => {
      const result = EntryStepSchema.safeParse({ type: 'wait', ms: 500 });
      expect(result.success).toBe(true);
    });
  });

  describe('EntryStepSchema — invalid discriminator', () => {
    it('type: bogus 는 discriminatedUnion fail', () => {
      const result = EntryStepSchema.safeParse({ type: 'bogus' });
      expect(result.success).toBe(false);
    });

    it('type 필드 자체 누락 시 fail', () => {
      const result = EntryStepSchema.safeParse({ x: 100, y: 200 });
      expect(result.success).toBe(false);
    });
  });
});
