/**
 * recordings-api.test.ts
 * recordingsApi.uploadToS3 — S3 presigned PUT 업로드 검증
 * issue: jajang#189
 */

jest.mock('expo-file-system/legacy', () => ({
  uploadAsync: jest.fn(),
  FileSystemUploadType: { BINARY_CONTENT: 'BINARY_CONTENT' },
}))

import * as FileSystem from 'expo-file-system/legacy'
import { recordingsApi } from '@services/api/recordings'

const mockedUpload = FileSystem.uploadAsync as jest.Mock

beforeEach(() => jest.clearAllMocks())

describe('recordingsApi.uploadToS3', () => {
  it('uploadAsync 를 PUT + BINARY_CONTENT + Content-Type 헤더로 호출한다', async () => {
    mockedUpload.mockResolvedValueOnce({ status: 200, body: '', headers: {} })
    await recordingsApi.uploadToS3('https://s3/url', 'file:///tmp/a.m4a', 'audio/m4a')
    expect(mockedUpload).toHaveBeenCalledWith('https://s3/url', 'file:///tmp/a.m4a', {
      httpMethod: 'PUT',
      uploadType: 'BINARY_CONTENT',
      headers: { 'Content-Type': 'audio/m4a' },
    })
  })

  it('non-2xx 면 status + body 일부를 포함한 Error 를 throw 한다', async () => {
    mockedUpload.mockResolvedValueOnce({
      status: 403,
      body: '<Error><Code>AccessDenied</Code></Error>',
      headers: {},
    })
    await expect(
      recordingsApi.uploadToS3('https://s3/url', 'file:///tmp/a.m4a', 'audio/m4a'),
    ).rejects.toThrow(/S3 upload failed: 403.*AccessDenied/)
  })

  it('200 OK 응답이면 resolve 한다', async () => {
    mockedUpload.mockResolvedValueOnce({ status: 200, body: '', headers: {} })
    await expect(
      recordingsApi.uploadToS3('https://s3/url', 'file:///tmp/a.m4a', 'audio/m4a'),
    ).resolves.toBeUndefined()
  })
})
