
jest.mock('@services/api', () => ({
  api: {
    get: jest.fn(),
  },
}));

import { api } from '@services/api';
import { getMyTracks, getNewlyCompletedTrack } from '@services/tracks-api';

describe('tracks-api', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getMyTracks', () => {
    it('GET /tracks 엔드포인트를 호출한다', async () => {
      jest.mocked(api.get).mockResolvedValue({ data: [] });
      await getMyTracks();
      expect(api.get).toHaveBeenCalledWith('/tracks');
    });

    it('API 응답 데이터를 그대로 반환한다', async () => {
      const mockTracks = [
        {
          id: '1',
          song_key: 'brahms',
          status: 'completed',
          s3_key: 'key1',
          completed_at: '2024-01-01T00:00:00.000Z',
        },
      ];
      jest.mocked(api.get).mockResolvedValue({ data: mockTracks });
      const result = await getMyTracks();
      expect(result).toEqual(mockTracks);
    });

    it('빈 배열을 반환할 수 있다', async () => {
      jest.mocked(api.get).mockResolvedValue({ data: [] });
      const result = await getMyTracks();
      expect(result).toEqual([]);
    });
  });

  describe('getNewlyCompletedTrack', () => {
    it('GET /tracks/newly-completed를 since 파라미터와 함께 호출한다', async () => {
      jest.mocked(api.get).mockResolvedValue({ data: null });
      const since = '2024-01-01T00:00:00.000Z';
      await getNewlyCompletedTrack(since);
      expect(api.get).toHaveBeenCalledWith('/tracks/newly-completed', {
        params: { since },
      });
    });

    it('lastCheckedAt 값을 since 파라미터로 정확히 전달한다', async () => {
      jest.mocked(api.get).mockResolvedValue({ data: null });
      const lastCheckedAt = '2024-06-15T08:30:00.000Z';
      await getNewlyCompletedTrack(lastCheckedAt);
      expect(api.get).toHaveBeenCalledWith('/tracks/newly-completed', {
        params: { since: lastCheckedAt },
      });
    });

    it('null을 반환할 수 있다 (새로 완료된 트랙 없음)', async () => {
      jest.mocked(api.get).mockResolvedValue({ data: null });
      const result = await getNewlyCompletedTrack('2024-01-01T00:00:00.000Z');
      expect(result).toBeNull();
    });

    it('새로 완료된 트랙 객체를 반환한다', async () => {
      const mockTrack = {
        id: 'track-1',
        song_key: 'brahms',
        status: 'completed',
        s3_key: 's3/audio/key',
        completed_at: '2024-01-02T10:00:00.000Z',
      };
      jest.mocked(api.get).mockResolvedValue({ data: mockTrack });
      const result = await getNewlyCompletedTrack('2024-01-01T00:00:00.000Z');
      expect(result).toEqual(mockTrack);
    });
  });
});
