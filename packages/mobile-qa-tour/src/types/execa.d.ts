// Type shim for execa v5 CommonJS 환경 전용 — re-declares module to allow named import pattern
// matching vitest mock: vi.mock('execa', () => ({ execa: vi.fn() }))
declare module 'execa' {
  export interface ExecaReturnValue<StdoutType = string> {
    stdout: StdoutType;
    stderr: string;
    exitCode: number;
    command: string;
  }

  export interface ExecaOptions<EncodingType = string> {
    timeout?: number;
    encoding?: EncodingType | null;
    reject?: boolean;
    [key: string]: unknown;
  }

  // encoding: null → Buffer 반환 (options 필수, encoding 필드 필수)
  export function execa(
    file: string,
    args: readonly string[],
    options: ExecaOptions & { encoding: null }
  ): Promise<ExecaReturnValue<Buffer>>;

  // encoding 생략 또는 string → string 반환
  export function execa(
    file: string,
    args?: readonly string[],
    options?: ExecaOptions
  ): Promise<ExecaReturnValue<string>>;
}
