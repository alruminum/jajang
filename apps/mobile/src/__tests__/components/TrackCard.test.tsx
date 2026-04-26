/**
 * TrackCard 컴포넌트 테스트
 * impl/07 — 앱: 홈 화면 트랙 목록 통합 (S06 확장)
 */
import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { TrackCard } from '@components/TrackCard'
import type { TrackItem } from '@services/api/tracks'

// ─────────────────────────────────────────────
// 픽스처
// ─────────────────────────────────────────────
const makeTrack = (overrides: Partial<TrackItem> = {}): TrackItem => ({
  id: 'track-uuid-1',
  job_id: 'job-uuid-1',
  song_key: 'lullaby_01',
  song_name: '아기 자장가',
  status: 'completed',
  presigned_url: 'https://cdn.example.com/track.mp3',
  created_at: '2024-01-15T10:00:00Z',
  completed_at: '2024-01-15T10:05:00Z',
  ...overrides,
})

// ─────────────────────────────────────────────
// describe: REQ-TrackCard-completed
// ─────────────────────────────────────────────
describe('TrackCard — completed 상태', () => {
  it('곡 이름을 렌더링한다', () => {
    const track = makeTrack({ song_name: '별빛 자장가' })
    const { getByText } = render(
      <TrackCard track={track} onPlay={vi.fn()} onDelete={vi.fn()} />,
    )
    expect(getByText('별빛 자장가')).toBeTruthy()
  })

  it('완료 날짜를 MM월 DD일 포맷으로 표시한다', () => {
    const track = makeTrack({ completed_at: '2024-03-07T00:00:00Z' })
    const { getByText } = render(
      <TrackCard track={track} onPlay={vi.fn()} onDelete={vi.fn()} />,
    )
    expect(getByText('3월 7일')).toBeTruthy()
  })

  it('completed_at이 없으면 created_at으로 날짜를 표시한다', () => {
    const track = makeTrack({ completed_at: null, created_at: '2024-06-01T00:00:00Z' })
    const { getByText } = render(
      <TrackCard track={track} onPlay={vi.fn()} onDelete={vi.fn()} />,
    )
    expect(getByText('6월 1일')).toBeTruthy()
  })

  it('▶ 재생 버튼이 노출된다', () => {
    const track = makeTrack()
    const { getByLabelText } = render(
      <TrackCard track={track} onPlay={vi.fn()} onDelete={vi.fn()} />,
    )
    expect(getByLabelText('재생')).toBeTruthy()
  })

  it('카드 탭 → onPlay(track)이 호출된다', () => {
    const track = makeTrack()
    const onPlay = vi.fn()
    const { getByLabelText } = render(
      <TrackCard track={track} onPlay={onPlay} onDelete={vi.fn()} />,
    )
    fireEvent.press(getByLabelText(`${track.song_name} 재생`))
    expect(onPlay).toHaveBeenCalledWith(track)
  })

  it('accessibilityLabel이 "곡명 재생"이다', () => {
    const track = makeTrack({ song_name: '달빛 자장가' })
    const { getByLabelText } = render(
      <TrackCard track={track} onPlay={vi.fn()} onDelete={vi.fn()} />,
    )
    expect(getByLabelText('달빛 자장가 재생')).toBeTruthy()
  })

  it('accessibilityHint이 "탭해서 재생하세요"이다', () => {
    const track = makeTrack()
    const { getByHintText } = render(
      <TrackCard track={track} onPlay={vi.fn()} onDelete={vi.fn()} />,
    )
    expect(getByHintText('탭해서 재생하세요')).toBeTruthy()
  })

  it('롱탭 → onDelete(track)이 호출된다', () => {
    const track = makeTrack()
    const onDelete = vi.fn()
    const { getByLabelText } = render(
      <TrackCard track={track} onPlay={vi.fn()} onDelete={onDelete} />,
    )
    fireEvent(getByLabelText(`${track.song_name} 재생`), 'longPress')
    expect(onDelete).toHaveBeenCalledWith(track)
  })
})

// ─────────────────────────────────────────────
// describe: REQ-TrackCard-pending
// ─────────────────────────────────────────────
describe('TrackCard — pending 상태', () => {
  it('"만들고 있어요…" 서브텍스트를 표시한다', () => {
    const track = makeTrack({ status: 'pending' })
    const { getByText } = render(
      <TrackCard track={track} onPlay={vi.fn()} onDelete={vi.fn()} />,
    )
    expect(getByText('만들고 있어요…')).toBeTruthy()
  })

  it('▶ 재생 버튼이 노출되지 않는다', () => {
    const track = makeTrack({ status: 'pending' })
    const { queryByLabelText } = render(
      <TrackCard track={track} onPlay={vi.fn()} onDelete={vi.fn()} />,
    )
    expect(queryByLabelText('재생')).toBeNull()
  })

  it('카드 탭 → onRetryPending(track)이 호출된다', () => {
    const track = makeTrack({ status: 'pending' })
    const onRetryPending = vi.fn()
    const { getByLabelText } = render(
      <TrackCard track={track} onPlay={vi.fn()} onRetryPending={onRetryPending} onDelete={vi.fn()} />,
    )
    fireEvent.press(getByLabelText(`${track.song_name} 생성 중`))
    expect(onRetryPending).toHaveBeenCalledWith(track)
  })

  it('onRetryPending 없이 탭해도 onPlay가 호출되지 않는다', () => {
    const track = makeTrack({ status: 'pending' })
    const onPlay = vi.fn()
    const { getByLabelText } = render(
      <TrackCard track={track} onPlay={onPlay} onDelete={vi.fn()} />,
    )
    fireEvent.press(getByLabelText(`${track.song_name} 생성 중`))
    expect(onPlay).not.toHaveBeenCalled()
  })

  it('processing 상태도 pending과 동일하게 "만들고 있어요…"를 표시한다', () => {
    const track = makeTrack({ status: 'processing' })
    const { getByText } = render(
      <TrackCard track={track} onPlay={vi.fn()} onDelete={vi.fn()} />,
    )
    expect(getByText('만들고 있어요…')).toBeTruthy()
  })

  it('accessibilityLabel이 "곡명 생성 중"이다', () => {
    const track = makeTrack({ status: 'pending', song_name: '밤의 자장가' })
    const { getByLabelText } = render(
      <TrackCard track={track} onPlay={vi.fn()} onDelete={vi.fn()} />,
    )
    expect(getByLabelText('밤의 자장가 생성 중')).toBeTruthy()
  })

  it('accessibilityHint이 "탭해서 생성 상태를 확인하세요"이다', () => {
    const track = makeTrack({ status: 'pending' })
    const { getByHintText } = render(
      <TrackCard track={track} onPlay={vi.fn()} onDelete={vi.fn()} />,
    )
    expect(getByHintText('탭해서 생성 상태를 확인하세요')).toBeTruthy()
  })
})

// ─────────────────────────────────────────────
// describe: REQ-TrackCard-failed
// ─────────────────────────────────────────────
describe('TrackCard — failed 상태', () => {
  it('"생성에 실패했어요" 서브텍스트를 표시한다', () => {
    const track = makeTrack({ status: 'failed' })
    const { getByText } = render(
      <TrackCard track={track} onPlay={vi.fn()} onDelete={vi.fn()} />,
    )
    expect(getByText('생성에 실패했어요')).toBeTruthy()
  })

  it('▶ 재생 버튼이 노출되지 않는다', () => {
    const track = makeTrack({ status: 'failed' })
    const { queryByLabelText } = render(
      <TrackCard track={track} onPlay={vi.fn()} onDelete={vi.fn()} />,
    )
    expect(queryByLabelText('재생')).toBeNull()
  })

  it('카드 탭해도 onPlay가 호출되지 않는다', () => {
    const track = makeTrack({ status: 'failed' })
    const onPlay = vi.fn()
    const { getByLabelText } = render(
      <TrackCard track={track} onPlay={onPlay} onDelete={vi.fn()} />,
    )
    fireEvent.press(getByLabelText(`${track.song_name} 생성 실패`))
    expect(onPlay).not.toHaveBeenCalled()
  })

  it('accessibilityLabel이 "곡명 생성 실패"이다', () => {
    const track = makeTrack({ status: 'failed', song_name: '실패 자장가' })
    const { getByLabelText } = render(
      <TrackCard track={track} onPlay={vi.fn()} onDelete={vi.fn()} />,
    )
    expect(getByLabelText('실패 자장가 생성 실패')).toBeTruthy()
  })

  it('accessibilityHint이 "길게 눌러서 삭제하세요"이다', () => {
    const track = makeTrack({ status: 'failed' })
    const { getByHintText } = render(
      <TrackCard track={track} onPlay={vi.fn()} onDelete={vi.fn()} />,
    )
    expect(getByHintText('길게 눌러서 삭제하세요')).toBeTruthy()
  })

  it('롱탭 → onDelete(track)이 호출된다', () => {
    const track = makeTrack({ status: 'failed' })
    const onDelete = vi.fn()
    const { getByLabelText } = render(
      <TrackCard track={track} onPlay={vi.fn()} onDelete={onDelete} />,
    )
    fireEvent(getByLabelText(`${track.song_name} 생성 실패`), 'longPress')
    expect(onDelete).toHaveBeenCalledWith(track)
  })
})
