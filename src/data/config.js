// M2 공통 설정값. (CLAUDE.md 데이터 모델/제약 반영)

// 캠퍼스 펜스: 건국대 중심좌표 반경 1km 내에서만 작성 허용.
export const CAMPUS = {
  center: { lat: 37.5408, lng: 127.0793 },
  radiusM: 1000,
  // ★ 오늘 집/다른 곳에서 작성 테스트하려면 false. 배포 전 반드시 true. ★
  fenceEnabled: false,
};

// 쓰기 제한: GPS accuracy 이 값 이하일 때만 작성 허용(장소 펜스 최소 구현).
export const WRITE_MAX_ACCURACY_M = 50;

// 조회: 현재 좌표 기준 bounding box (±0.0005도 ≈ 50m).
export const BBOX_DELTA_DEG = 0.0005;

// 이만큼(m) 이동하면 주변 메시지를 다시 불러온다.
export const REFETCH_MOVE_M = 25;

// 작성 시 내 위치에서 바라보는 방향으로 이만큼(m) 앞에 저장.
// (코앞에 박히지 않고 정면에 떠 보이게 하는 보정)
export const WRITE_FORWARD_OFFSET_M = 2;

// 렌더 시 최소 표시 거리(m). 이보다 가까운 글은 이 거리로 밀어낸다.
export const MIN_DISPLAY_M = 1.5;

// 제목/본문/닉네임 길이 제한 (DB 스키마와 일치).
export const MAX_TITLE = 40;
export const MAX_TEXT = 200;
export const MAX_NICK = 20;
