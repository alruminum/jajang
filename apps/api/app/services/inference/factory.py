import functools

from app.core.config import settings
from app.services.inference.base import VoiceInferenceClient


@functools.lru_cache(maxsize=1)
def get_inference_client() -> VoiceInferenceClient:
    """
    MOCK_GPU=true (기본) → MockInferenceClient
    INFERENCE_PROVIDER=replicate → ReplicateClient (M0 이후 구현)
    INFERENCE_PROVIDER=modal    → ModalClient (M0 이후 구현)

    lru_cache로 싱글톤 보장.
    Celery worker 프로세스마다 한 번 초기화.
    """
    mock_gpu = settings.MOCK_GPU
    provider = settings.INFERENCE_PROVIDER.lower()

    if mock_gpu or provider == "mock":
        from app.services.inference.mock_client import MockInferenceClient
        return MockInferenceClient()

    if provider == "replicate":
        # M0 이후 구현
        # from app.services.inference.replicate_client import ReplicateClient
        # return ReplicateClient(api_token=os.environ["REPLICATE_API_TOKEN"])
        raise NotImplementedError(
            "ReplicateClient not implemented yet. "
            "Set MOCK_GPU=true for development. "
            "Implement after M0 benchmark."
        )

    if provider == "modal":
        # M0 이후 구현
        # from app.services.inference.modal_client import ModalClient
        # return ModalClient(token_id=os.environ["MODAL_TOKEN_ID"])
        raise NotImplementedError(
            "ModalClient not implemented yet. "
            "Set MOCK_GPU=true for development."
        )

    raise ValueError(f"Unknown INFERENCE_PROVIDER: {provider!r}")
