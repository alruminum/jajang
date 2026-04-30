from app.core.config import settings
from app.services.dsp.ffmpeg_service import DspService
from app.services.dsp.mock_dsp_service import MockDspService


def get_dsp_service():
    """MOCK_DSP 환경변수에 따라 DspService 또는 MockDspService 반환."""
    if settings.MOCK_DSP:
        return MockDspService(latency_ms=settings.MOCK_LATENCY_MS)
    return DspService()
