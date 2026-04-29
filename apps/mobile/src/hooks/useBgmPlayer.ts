import { useEffect, useRef, useState } from 'react';
import { createAudioPlayer } from 'expo-audio';

import { songsApi } from '../services/songs-api';

interface UseBgmPlayerOptions {
  songKey: string;
  enabled: boolean;
  onLoadError?: () => void;
}

interface UseBgmPlayerReturn {
  isPlaying: boolean;
  loadFailed: boolean;
  startBgm: () => Promise<void>;
  stopBgm: () => Promise<void>;
}

const TARGET_VOLUME = 0.3;
const RAMP_STEP = 0.03;
const RAMP_UP_INTERVAL_MS = 30;
const RAMP_DOWN_INTERVAL_MS = 20;

type AudioPlayerInstance = {
  loop: boolean;
  volume: number;
  play: () => void;
  pause: () => void;
  remove: () => void;
};

export function useBgmPlayer(options: UseBgmPlayerOptions): UseBgmPlayerReturn {
  const { songKey, enabled, onLoadError } = options;

  const [isPlaying, setIsPlaying] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const playerRef = useRef<AudioPlayerInstance | null>(null);
  const rampUpRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rampDownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const loadFailedRef = useRef(false);
  const onLoadErrorRef = useRef(onLoadError);

  useEffect(() => {
    onLoadErrorRef.current = onLoadError;
  }, [onLoadError]);

  const clearRampUp = () => {
    if (rampUpRef.current) {
      clearInterval(rampUpRef.current);
      rampUpRef.current = null;
    }
  };

  const clearRampDown = () => {
    if (rampDownRef.current) {
      clearInterval(rampDownRef.current);
      rampDownRef.current = null;
    }
  };

  const startBgm = async (): Promise<void> => {
    if (!enabled || loadFailedRef.current) return;
    if (playerRef.current) return;

    let url: string;
    try {
      const response = await songsApi.getPreviewUrl(songKey);
      url = response.preview_url;
    } catch {
      loadFailedRef.current = true;
      setLoadFailed(true);
      onLoadErrorRef.current?.();
      return;
    }

    const player = createAudioPlayer(
      { uri: url } as Parameters<typeof createAudioPlayer>[0],
    ) as unknown as AudioPlayerInstance;
    player.volume = 0;
    player.loop = true;
    player.play();

    playerRef.current = player;
    setIsPlaying(true);

    clearRampUp();
    rampUpRef.current = setInterval(() => {
      const p = playerRef.current;
      if (!p) {
        clearRampUp();
        return;
      }
      const next = Math.min(TARGET_VOLUME, p.volume + RAMP_STEP);
      p.volume = next;
      if (next >= TARGET_VOLUME) clearRampUp();
    }, RAMP_UP_INTERVAL_MS);
  };

  const stopBgm = async (): Promise<void> => {
    if (!playerRef.current) return;

    clearRampUp();
    clearRampDown();

    rampDownRef.current = setInterval(() => {
      const cur = playerRef.current;
      if (!cur) {
        clearRampDown();
        return;
      }
      const next = Math.max(0, cur.volume - RAMP_STEP);
      cur.volume = next;
      if (next <= 0) {
        clearRampDown();
        cur.pause();
        cur.remove();
        playerRef.current = null;
        setIsPlaying(false);
      }
    }, RAMP_DOWN_INTERVAL_MS);
  };

  useEffect(() => {
    return () => {
      clearRampUp();
      clearRampDown();
      const p = playerRef.current;
      if (p) {
        p.pause();
        p.remove();
        playerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { isPlaying, loadFailed, startBgm, stopBgm };
}
