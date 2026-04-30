import time
import shutil
import os
import structlog

logger = structlog.get_logger()

# placeholder mp3: 실제 CC0 자장가 30초 클립 또는 sine wave mp3
# 경로: apps/api/app/static/mock_master.mp3 (git tracked)
MOCK_MP3_PATH = os.path.join(os.path.dirname(__file__), "../../static/mock_master.mp3")


class MockDspService:
    def __init__(self, latency_ms: int = 3000):
        self._latency_ms = latency_ms

    def process(
        self,
        clip_paths: list[str],
        output_path: str,
        previous_clip_index: int | None = None,
    ) -> None:
        """MOCK_DSP=true 환경: ffmpeg 없이 placeholder mp3 반환."""
        logger.info("mock_dsp.process", latency_ms=self._latency_ms, clips=len(clip_paths))
        time.sleep(self._latency_ms / 1000)

        if not os.path.exists(MOCK_MP3_PATH):
            # static 파일 없으면 빈 파일 생성 (최소 동작 보장)
            with open(output_path, "wb") as f:
                f.write(b"ID3")  # 최소 MP3 헤더 (실제 재생 불가하나 파이프라인 테스트용)
        else:
            shutil.copy2(MOCK_MP3_PATH, output_path)
