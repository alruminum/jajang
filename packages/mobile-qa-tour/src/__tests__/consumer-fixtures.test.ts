import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QaConfigSchema, ScreenSchema } from '../config/schema';
import { loadConfig, ConfigLoadError } from '../config/load';

// vi.mock 은 vitest 가 static import 보다 먼저 hoisting — node:fs/promises 전체 mock
vi.mock('node:fs/promises');
import * as fsp from 'node:fs/promises';
const mockReadFile = vi.mocked(fsp.readFile as (path: string, enc: string) => Promise<string>);

// ---------------------------------------------------------------------------
// REQ-CONSUMER-01 — jajang qa.config.json fixture 가 QaConfigSchema 를 통과
// REQ-CONSUMER-02 — jajang screen-registry.json fixture 가 ScreenSchema[] 를 통과
// REQ-CONSUMER-03 — loadConfig 가 jajang fixture 조합(config + registry)을 올바르게 머지
// REQ-CONSUMER-04 — qa.config.json 에 pencil 블록 추가 시 QaConfigSchema 정합 (impl/05)
//
// 이 파일은 TDD RED 상태에서 시작.
// engineer 가 impl/04 산출 후 GREEN 전환 — 스키마·인터페이스 검증이 목적.
// impl/05 에서 JAJANG_QA_CONFIG 에 pencil 블록 추가 → REQ-CONSUMER-04 GREEN 확인.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// fixture: apps/mobile/qa.config.json 인터페이스 그대로 (impl §인터페이스 기준)
// impl/05 에서 pencil 블록 추가됨.
// ---------------------------------------------------------------------------
const JAJANG_QA_CONFIG = {
  appPackage: 'com.jajang.app',
  outputDir: '../../docs/qa',
  uxFlowAnchor: '../../docs/ux-flow.md',
  screenRegistryPath: './screen-registry.json',
  pencil: {
    enabled: true,
    documentPath: '../../design/jajang.pen',
    nodeIds: {
      S10: ['llTp1', 'r97aM'],
    },
  },
};

// ---------------------------------------------------------------------------
// fixture: apps/mobile/screen-registry.json 인터페이스 그대로 (impl §인터페이스 기준)
// 실측 testID 는 impl 에서 "<실측 testID>" placeholder — 여기선 non-empty string 으로 대체.
// S10 의 permissionGrant step 포함 → 모든 step type 커버.
// ---------------------------------------------------------------------------
const JAJANG_SCREEN_REGISTRY = [
  {
    id: 'S06',
    label: 'Home',
    entrySteps: [],
    settleMs: 2000,
  },
  {
    id: 'S07',
    label: 'SongSelect',
    entrySteps: [{ type: 'tapTestId', testId: 'btn-song-select' }],
    settleMs: 2000,
  },
  {
    id: 'S09',
    label: 'RecordGuide',
    entrySteps: [
      { type: 'tapTestId', testId: 'btn-song-select' },
      { type: 'wait', ms: 1500 },
      { type: 'tapTestId', testId: 'song-item-0' },
    ],
    settleMs: 2000,
  },
  {
    id: 'S10',
    label: 'Record',
    entrySteps: [
      { type: 'tapTestId', testId: 'btn-song-select' },
      { type: 'wait', ms: 1500 },
      { type: 'tapTestId', testId: 'song-item-0' },
      { type: 'wait', ms: 1500 },
      { type: 'tapTestId', testId: 'btn-start-record' },
      { type: 'permissionGrant', permission: 'android.permission.RECORD_AUDIO' },
    ],
    settleMs: 2000,
    pencilNodeIds: ['llTp1', 'r97aM'],
  },
  {
    id: 'S11_SKIP',
    label: 'Preview (skip — 30s recording required)',
    entrySteps: [],
    settleMs: 0,
  },
  {
    id: 'S16',
    label: 'Settings',
    entrySteps: [{ type: 'tapTestId', testId: 'tab-settings' }],
    settleMs: 2000,
  },
  {
    id: 'AccountDeletion',
    label: 'Account Deletion (smoke only — 실제 삭제 차단)',
    entrySteps: [
      { type: 'tapTestId', testId: 'tab-settings' },
      { type: 'wait', ms: 1500 },
      { type: 'tapTestId', testId: 'btn-account-deletion' },
    ],
    settleMs: 2000,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// REQ-CONSUMER-01: qa.config.json 스키마 정합
// 수용 기준 (재사용) "패키지 코드에 com.jajang 없음" 과 쌍을 이룸 —
// consumer config 가 스키마를 통과함을 보장해야 패키지가 config 를 올바르게 읽음.
// ---------------------------------------------------------------------------
describe('REQ-CONSUMER-01 jajang qa.config.json — QaConfigSchema 정합', () => {
  it('jajang qa.config.json fixture 가 QaConfigSchema.safeParse 를 통과', () => {
    const result = QaConfigSchema.safeParse(JAJANG_QA_CONFIG);
    expect(result.success).toBe(true);
  });

  it('parse 후 appPackage 가 com.jajang.app', () => {
    const result = QaConfigSchema.safeParse(JAJANG_QA_CONFIG);
    expect(result.success).toBe(true);
    expect((result as any).data.appPackage).toBe('com.jajang.app');
  });

  it('parse 후 screenRegistryPath 가 ./screen-registry.json', () => {
    const result = QaConfigSchema.safeParse(JAJANG_QA_CONFIG);
    expect(result.success).toBe(true);
    expect((result as any).data.screenRegistryPath).toBe('./screen-registry.json');
  });

  it('appPackage 빈 문자열이면 parse fail — min(1) 강제', () => {
    const invalid = { ...JAJANG_QA_CONFIG, appPackage: '' };
    const result = QaConfigSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('screenRegistryPath 도 screens 도 없는 config 는 refine fail', () => {
    const invalid = { appPackage: 'com.jajang.app', outputDir: '../../docs/qa' };
    const result = QaConfigSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// REQ-CONSUMER-04: impl/05 pencil 블록 — QaConfigSchema 정합 (신규)
// qa.config.json 에 pencil 블록 추가 시 기존 스키마를 통과하는지 검증.
// ---------------------------------------------------------------------------
describe('REQ-CONSUMER-04 jajang qa.config.json — pencil 블록 스키마 정합 (impl/05)', () => {
  it('pencil 블록 포함 fixture 가 QaConfigSchema.safeParse 를 통과', () => {
    const result = QaConfigSchema.safeParse(JAJANG_QA_CONFIG);
    expect(result.success).toBe(true);
  });

  it('parse 후 pencil.enabled 가 true', () => {
    const result = QaConfigSchema.safeParse(JAJANG_QA_CONFIG);
    expect(result.success).toBe(true);
    expect((result as any).data.pencil?.enabled).toBe(true);
  });

  it('parse 후 pencil.documentPath 가 ../../design/jajang.pen', () => {
    const result = QaConfigSchema.safeParse(JAJANG_QA_CONFIG);
    expect(result.success).toBe(true);
    expect((result as any).data.pencil?.documentPath).toBe('../../design/jajang.pen');
  });

  it('parse 후 pencil.nodeIds.S10 가 ["llTp1", "r97aM"]', () => {
    const result = QaConfigSchema.safeParse(JAJANG_QA_CONFIG);
    expect(result.success).toBe(true);
    expect((result as any).data.pencil?.nodeIds?.S10).toEqual(['llTp1', 'r97aM']);
  });

  it('pencil.enabled=false 인 config 도 QaConfigSchema 통과 (선택적 비활성)', () => {
    const disabledPencil = {
      ...JAJANG_QA_CONFIG,
      pencil: { enabled: false },
    };
    const result = QaConfigSchema.safeParse(disabledPencil);
    expect(result.success).toBe(true);
  });

  it('pencil 블록 없는 config 도 QaConfigSchema 통과 (optional 필드)', () => {
    const withoutPencil = {
      appPackage: 'com.jajang.app',
      outputDir: '../../docs/qa',
      screenRegistryPath: './screen-registry.json',
    };
    const result = QaConfigSchema.safeParse(withoutPencil);
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// REQ-CONSUMER-02: screen-registry.json 스키마 정합
// 수용 기준 (CLI) "npm run qa:tour" 전제 조건 — registry 가 스키마 통과해야 tour 실행 가능.
// ---------------------------------------------------------------------------
describe('REQ-CONSUMER-02 jajang screen-registry.json — ScreenSchema[] 정합', () => {
  it('7개 화면 전체가 ScreenSchema[] safeParse 를 통과', () => {
    const result = ScreenSchema.array().safeParse(JAJANG_SCREEN_REGISTRY);
    expect(result.success).toBe(true);
  });

  it('파싱 결과 화면 수가 7', () => {
    const result = ScreenSchema.array().safeParse(JAJANG_SCREEN_REGISTRY);
    expect(result.success).toBe(true);
    expect((result as any).data).toHaveLength(7);
  });

  it('S06 — entrySteps 빈 배열 parse 성공 (Home 화면 첫 진입 조건)', () => {
    const s06 = JAJANG_SCREEN_REGISTRY.find((s) => s.id === 'S06')!;
    const result = ScreenSchema.safeParse(s06);
    expect(result.success).toBe(true);
    expect((result as any).data.entrySteps).toHaveLength(0);
  });

  it('S10 — permissionGrant step 이 EntryStepSchema 를 통과', () => {
    const s10 = JAJANG_SCREEN_REGISTRY.find((s) => s.id === 'S10')!;
    const result = ScreenSchema.safeParse(s10);
    expect(result.success).toBe(true);
    const permStep = (result as any).data.entrySteps.find(
      (st: any) => st.type === 'permissionGrant',
    );
    expect(permStep).toBeDefined();
    expect(permStep.permission).toBe('android.permission.RECORD_AUDIO');
  });

  it('S10 — pencilNodeIds 가 ["llTp1", "r97aM"]', () => {
    const s10 = JAJANG_SCREEN_REGISTRY.find((s) => s.id === 'S10')!;
    const result = ScreenSchema.safeParse(s10);
    expect(result.success).toBe(true);
    expect((result as any).data.pencilNodeIds).toEqual(['llTp1', 'r97aM']);
  });

  it('S11_SKIP — settleMs 가 0 (skip 화면 의도 보존)', () => {
    const s11 = JAJANG_SCREEN_REGISTRY.find((s) => s.id === 'S11_SKIP')!;
    const result = ScreenSchema.safeParse(s11);
    expect(result.success).toBe(true);
    expect((result as any).data.settleMs).toBe(0);
  });

  it('wait step ms 가 음수이면 ScreenSchema fail — 오기입 회귀 방지', () => {
    const invalid = [{ id: 'S07', entrySteps: [{ type: 'wait', ms: -1 }] }];
    const result = ScreenSchema.array().safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('tapTestId step testId 가 빈 문자열이면 ScreenSchema fail — 오기입 회귀 방지', () => {
    const invalid = [{ id: 'S07', entrySteps: [{ type: 'tapTestId', testId: '' }] }];
    const result = ScreenSchema.array().safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// REQ-CONSUMER-03: loadConfig 가 jajang fixture 조합(config + registry)을 올바르게 머지
// 수용 기준 (CLI) "npm run qa:tour" 의 핵심 경로 — loadConfig 가 registry 머지해야 동작.
// ---------------------------------------------------------------------------
describe('REQ-CONSUMER-03 loadConfig — jajang fixture 조합 머지', () => {
  it('qa.config.json + screen-registry.json 조합 시 config.screens 에 7개 화면이 머지됨', async () => {
    mockReadFile
      .mockResolvedValueOnce(JSON.stringify(JAJANG_QA_CONFIG))
      .mockResolvedValueOnce(JSON.stringify(JAJANG_SCREEN_REGISTRY));

    const config = await loadConfig('/apps/mobile/qa.config.json');
    expect(config.appPackage).toBe('com.jajang.app');
    expect(config.screens).toHaveLength(7);
  });

  it('머지 결과 screens[0].id 가 S06 (Home — registry 순서 보존)', async () => {
    mockReadFile
      .mockResolvedValueOnce(JSON.stringify(JAJANG_QA_CONFIG))
      .mockResolvedValueOnce(JSON.stringify(JAJANG_SCREEN_REGISTRY));

    const config = await loadConfig('/apps/mobile/qa.config.json');
    expect(config.screens![0].id).toBe('S06');
    expect(config.screens![0].entrySteps).toHaveLength(0);
  });

  it('머지 결과 config.pencil.enabled 가 true (impl/05 pencil 블록 보존)', async () => {
    mockReadFile
      .mockResolvedValueOnce(JSON.stringify(JAJANG_QA_CONFIG))
      .mockResolvedValueOnce(JSON.stringify(JAJANG_SCREEN_REGISTRY));

    const config = await loadConfig('/apps/mobile/qa.config.json');
    expect(config.pencil?.enabled).toBe(true);
  });

  it('registry 에 schema 위반 항목 있으면 ConfigLoadError 발생 — consumer 오기입 회귀 방지', async () => {
    const brokenRegistry = [
      { id: 'S06', entrySteps: [{ type: 'wait', ms: -1 }] },
    ];
    mockReadFile
      .mockResolvedValueOnce(JSON.stringify(JAJANG_QA_CONFIG))
      .mockResolvedValueOnce(JSON.stringify(brokenRegistry));

    await expect(loadConfig('/apps/mobile/qa.config.json')).rejects.toThrow(ConfigLoadError);
  });

  it('screen-registry.json ENOENT 시 ConfigLoadError — screenRegistry not found 메시지', async () => {
    const err = Object.assign(new Error('no such file'), { code: 'ENOENT' });
    mockReadFile
      .mockResolvedValueOnce(JSON.stringify(JAJANG_QA_CONFIG))
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce(JSON.stringify(JAJANG_QA_CONFIG))
      .mockRejectedValueOnce(err);

    await expect(loadConfig('/apps/mobile/qa.config.json')).rejects.toThrow(ConfigLoadError);
    await expect(loadConfig('/apps/mobile/qa.config.json')).rejects.toThrow(/screenRegistry not found/);
  });
});
