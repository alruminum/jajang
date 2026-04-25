/**
 * SongListItem.test.tsx
 * SongListItem 컴포넌트 — 렌더링, 선택/미리듣기 상태, 이벤트 분리 검증
 * impl: docs/milestones/v1/epics/epic-02-recording/impl/04-app-song-select-screen.md §4
 */

import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SongListItem } from '@components/SongListItem'
import type { Song } from '@services/api/songs'

// ────────────────────────────────────────────
// 공통 픽스처
// ────────────────────────────────────────────
const mockSong: Song = {
  key: 'brahms',
  title_ko: '자장가',
  title_en: 'Lullaby',
  composer: 'Brahms',
  duration_seconds: 180,
}

function makeProps(overrides: Partial<React.ComponentProps<typeof SongListItem>> = {}) {
  return {
    song: mockSong,
    isSelected: false,
    isPreviewPlaying: false,
    isPreviewLoading: false,
    onSelect: vi.fn(),
    onPreviewToggle: vi.fn(),
    ...overrides,
  }
}

// ────────────────────────────────────────────
// 기본 렌더링
// ────────────────────────────────────────────
describe('SongListItem — 기본 렌더링', () => {
  it('곡 제목(title_ko)을 화면에 표시한다', () => {
    render(<SongListItem {...makeProps()} />)
    expect(screen.getByText('자장가')).toBeTruthy()
  })

  it('작곡가(composer)를 화면에 표시한다', () => {
    render(<SongListItem {...makeProps()} />)
    expect(screen.getByText('Brahms')).toBeTruthy()
  })

  it('미리듣기 정지 상태에서 ▷ 아이콘을 표시한다', () => {
    render(<SongListItem {...makeProps({ isPreviewPlaying: false })} />)
    expect(screen.getByText('▷')).toBeTruthy()
  })
})

// ────────────────────────────────────────────
// 선택 상태
// ────────────────────────────────────────────
describe('SongListItem — 선택 상태', () => {
  it('isSelected=true 일 때 accessibilityState.selected가 true다', () => {
    render(<SongListItem {...makeProps({ isSelected: true })} />)
    expect(screen.getByAccessibilityState({ selected: true })).toBeTruthy()
  })

  it('isSelected=false 일 때 accessibilityState.selected가 false다', () => {
    render(<SongListItem {...makeProps({ isSelected: false })} />)
    expect(screen.getByAccessibilityState({ selected: false })).toBeTruthy()
  })
})

// ────────────────────────────────────────────
// 미리듣기 상태
// ────────────────────────────────────────────
describe('SongListItem — 미리듣기 상태', () => {
  it('isPreviewPlaying=true 일 때 ⏸ 아이콘을 표시한다', () => {
    render(<SongListItem {...makeProps({ isPreviewPlaying: true })} />)
    expect(screen.getByText('⏸')).toBeTruthy()
  })

  it('isPreviewPlaying=true 일 때 ▷ 아이콘을 숨긴다', () => {
    render(<SongListItem {...makeProps({ isPreviewPlaying: true })} />)
    expect(screen.queryByText('▷')).toBeFalsy()
  })

  it('isPreviewLoading=true 일 때 ▷ 아이콘을 숨긴다 (로딩 스피너 표시)', () => {
    render(<SongListItem {...makeProps({ isPreviewLoading: true })} />)
    expect(screen.queryByText('▷')).toBeFalsy()
  })

  it('isPreviewLoading=true 일 때 ⏸ 아이콘을 숨긴다', () => {
    render(<SongListItem {...makeProps({ isPreviewLoading: true, isPreviewPlaying: true })} />)
    expect(screen.queryByText('⏸')).toBeFalsy()
  })
})

// ────────────────────────────────────────────
// Accessibility
// ────────────────────────────────────────────
describe('SongListItem — accessibility', () => {
  it('곡 아이템 accessibilityLabel에 "{title_ko} 선택" 포함', () => {
    render(<SongListItem {...makeProps()} />)
    expect(screen.getByLabelText('자장가 선택')).toBeTruthy()
  })

  it('미리듣기 버튼 label: 정지 중일 때 "{title_ko} 미리듣기"', () => {
    render(<SongListItem {...makeProps({ isPreviewPlaying: false })} />)
    expect(screen.getByLabelText('자장가 미리듣기')).toBeTruthy()
  })

  it('미리듣기 버튼 label: 재생 중일 때 "{title_ko} 미리듣기 정지"', () => {
    render(<SongListItem {...makeProps({ isPreviewPlaying: true })} />)
    expect(screen.getByLabelText('자장가 미리듣기 정지')).toBeTruthy()
  })
})

// ────────────────────────────────────────────
// 이벤트 핸들러
// ────────────────────────────────────────────
describe('SongListItem — 이벤트 핸들러', () => {
  it('곡 아이템 탭 시 onSelect가 1회 호출된다', () => {
    const onSelect = vi.fn()
    render(<SongListItem {...makeProps({ onSelect })} />)
    fireEvent.press(screen.getByLabelText('자장가 선택'))
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('미리듣기 버튼 탭 시 onPreviewToggle이 1회 호출된다', () => {
    const onPreviewToggle = vi.fn()
    render(<SongListItem {...makeProps({ onPreviewToggle })} />)
    fireEvent.press(screen.getByLabelText('자장가 미리듣기'))
    expect(onPreviewToggle).toHaveBeenCalledTimes(1)
  })

  it('미리듣기 버튼 탭 시 onSelect는 호출되지 않는다 (이벤트 전파 분리)', () => {
    const onSelect = vi.fn()
    const onPreviewToggle = vi.fn()
    render(<SongListItem {...makeProps({ onSelect, onPreviewToggle })} />)
    fireEvent.press(screen.getByLabelText('자장가 미리듣기'))
    expect(onSelect).not.toHaveBeenCalled()
  })
})
