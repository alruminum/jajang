"""
데이터 내보내기 엔드포인트 미구현 확인 (impl/02 수용 기준 §2)

V1 Deferred 결정:
  GDPR Art.15(열람권)은 EU 거주자에게만 적용.
  V1 타깃(한국 iOS/Android)은 PIPA 적용이며 자동화된 내보내기 의무 없음.
  구현 예정: V1 출시 후 EU 진출 시점에 재설계 (impl/02 §2 V2 설계 예약 참조).

이 테스트가 통과하는 한, 데이터 내보내기 엔드포인트가 실수로 추가되지 않았음을 보장한다.
"""

from app.main import app


def test_export_endpoint_not_registered() -> None:
    """POST /api/v1/users/me/export 라우트가 V1 라우터에 등록되지 않았음을 확인한다.

    V1 Deferred: 데이터 내보내기는 EU 진출 시점(V2)에 구현 예정.
    impl/02-server-data-export.md §1 참조.

    검사 방식:
      FastAPI 는 include_router() 호출 시 하위 라우터의 모든 경로를 app.routes 에 플랫하게
      등록한다. 따라서 app.routes 를 순회하면 중첩 라우터 포함 전체 엔드포인트를 커버한다.
    """
    export_paths = [
        route.path  # type: ignore[attr-defined]
        for route in app.routes
        if hasattr(route, "path") and "export" in route.path  # type: ignore[attr-defined]
    ]
    assert export_paths == [], (
        f"데이터 내보내기 엔드포인트가 V1에 등록되었습니다: {export_paths}. "
        "impl/02-server-data-export.md 의 V1 Deferred 결정을 참고하세요."
    )
