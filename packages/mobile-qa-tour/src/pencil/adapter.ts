import type { Screen, QaConfig } from '../config/schema';

export function preparePencilSlot(
  screen: Screen,
  pencilConfig: NonNullable<QaConfig['pencil']>,
): string | undefined {
  if (pencilConfig.enabled === false) {
    return undefined;
  }

  const screenNodeIds = screen.pencilNodeIds ?? [];
  const configNodeIds = pencilConfig.nodeIds?.[screen.id] ?? [];
  const nodeIds = [...new Set([...screenNodeIds, ...configNodeIds])];

  if (nodeIds.length === 0) {
    return undefined;
  }

  return `<!-- pencil ref slot
  document: ${pencilConfig.documentPath}
  screen: ${screen.id}
  nodeIds: [${nodeIds.join(', ')}]
  action: 메인 Claude 가 mcp__pencil__get_screenshot 호출 후 본 슬롯 아래에 reference png 첨부
-->`;
}
