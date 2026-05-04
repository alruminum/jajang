import { adbShell } from '../adb';
import { dumpUi, parseUi, findByResourceId, bbCenter } from './uiautomator';
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
    case 'tapTestId': {
      const xml = await dumpUi();
      const root = await parseUi(xml);
      const node = findByResourceId(root, step.testId);
      if (!node) {
        throw new Error(`tapTestId: resource-id="${step.testId}" not found in current dump`);
      }
      const { x, y } = bbCenter(node);
      await adbShell(`input tap ${x} ${y}`);
      return;
    }
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
