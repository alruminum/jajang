import { adbShell } from '../adb';
import type { EntryStep } from '../config/schema';

export type { EntryStep };

export interface EntryStepCtx {
  appPackage: string;
}

function shellEscapeText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/ /g, '%s');
}

function shellQuoteUri(uri: string): string {
  return `'${uri.replace(/'/g, "'\\''")}'`;
}

export async function executeStep(step: EntryStep, ctx: EntryStepCtx): Promise<void> {
  switch (step.type) {
    case 'tap':
      await adbShell(`input tap ${step.x} ${step.y}`);
      return;
    case 'tapTestId':
      throw new Error(
        `tapTestId requires uiautomator dump (batch 03 미완료). testId=${step.testId} — 좌표 tap 사용 권장 또는 batch 03 완료 후 재실행.`,
      );
    case 'inputText':
      await adbShell(`input text ${shellEscapeText(step.text)}`);
      return;
    case 'keyevent':
      await adbShell(`input keyevent ${step.code}`);
      return;
    case 'permissionGrant':
      await adbShell(`pm grant ${ctx.appPackage} ${step.permission}`);
      return;
    case 'deepLink':
      await adbShell(
        `am start -a android.intent.action.VIEW -d ${shellQuoteUri(step.uri)} ${ctx.appPackage}`,
      );
      return;
    case 'wait':
      await new Promise((r) => setTimeout(r, step.ms));
      return;
    default: {
      const _exhaustive: never = step;
      throw new Error(`unknown step type: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

export async function executeSteps(steps: EntryStep[], ctx: EntryStepCtx): Promise<void> {
  for (const step of steps) await executeStep(step, ctx);
}
