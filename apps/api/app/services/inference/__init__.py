"""
VoiceInferenceClient — 보이스 변환 추론 추상화 계층.

MOCK_GPU=true (기본): MockInferenceClient (3초 대기 후 placeholder mp3 반환)
M0 벤치마크 후: ReplicateClient 또는 ModalClient로 교체 (factory.py에서 분기)
"""
