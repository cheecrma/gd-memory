# CLAUDE.md — 건대의 기억 (PoC v0)

## 프로젝트 한 줄 정의
건국대 캠퍼스의 특정 GPS 위치에 텍스트를 남기면, 그 자리에서 카메라를 켰을 때 공중에 글이 떠 있는 위치 기반 웹AR 앱. PoC 단계.

## 절대 원칙 (위반 금지)
- **비용 0원**: 유료 API/서비스 절대 사용 금지. 8th Wall, Niantic Lightship, 유료 지도 호출 금지.
- **텍스트만**: 이미지/영상 업로드 기능 만들지 않음. 텍스트 + GPS 좌표 + 타임스탬프만 저장.
- **웹 우선**: 네이티브 앱 아님. 모바일 브라우저(iOS Safari + Android Chrome)에서 QR/링크로 바로 실행.
- **PoC 범위 준수**: 아래 마일스톤 외 기능(알림, 배지, 타임캡슐 등)은 만들지 말 것. 요청 없이 기능 추가 금지.

## 기술 스택 (확정)
| 영역 | 선택 | 이유 |
|---|---|---|
| 프론트 | Vite + 바닐라 JS(또는 React) + **three.js** | 경량, 무료 |
| AR | **LocAR.js** (location-based AR, AR.js 후속) 또는 three.js + 직접 구현 | GPS+자이로 기반, 무료. VPS 안 씀 |
| 카메라 | getUserMedia 배경 + three.js 투명 캔버스 오버레이 | 표준 웹 API |
| 백엔드/DB | **Supabase 무료 티어** (Postgres + REST + Row Level Security) | 서버 관리 0, 무료 |
| 호스팅 | **Vercel 무료** (또는 Netlify) | HTTPS 자동 — 카메라/GPS 권한에 HTTPS 필수 |
| 지도(목록 뷰) | Kakao Maps JavaScript SDK (무료) | 선택 기능, M3 |
| 로그인 | v0: 닉네임 입력만. Kakao OAuth는 M4로 연기 | 오늘 테스트에 OAuth 불필요 |

## 핵심 기술 제약 (반드시 코드에 반영)
1. **GPS 오차 5~15m가 정상.** "정확한 지점"이 아니라 "반경 표시" UX로 설계:
   - 반경 50m 내 메시지를 모두 로드, 방위각(bearing)+거리로 3D 공간 배치.
   - 거리에 따라 텍스트 크기 축소, 각 메시지에 "약 12m" 거리 뱃지 표시.
   - 같은 방향 메시지가 겹치면 세로로 스택.
2. **고도는 쓰지 않는다.** GPS 고도는 신뢰 불가. 모든 메시지는 사용자 눈높이(카메라 기준 y=0~+1m)에 고정 렌더.
3. **iOS Safari 분기 필수**:
   - `DeviceOrientationEvent.requestPermission()` — 사용자 탭 이벤트 안에서 호출해야 함 (버튼 "AR 시작" 필요).
   - 나침반: iOS는 `webkitCompassHeading`, Android는 `deviceorientationabsolute` 이벤트의 `alpha`. 둘 다 처리.
4. **Geolocation**: `watchPosition` 사용 (`enableHighAccuracy: true`). 첫 fix 전 로딩 UI 필수. accuracy 값이 30m 초과면 "GPS 신호가 약해요" 안내.
5. **나침반 캘리브레이션 안내**: 방위 오차가 크면 "폰을 8자로 흔들어주세요" 토스트.
6. HTTPS 전제. 로컬 개발 시 `vite --host` + 폰에서 자체 인증서 또는 그냥 Vercel preview 배포로 테스트.

## 데이터 모델 (Supabase)
```sql
create table memories (
  id uuid primary key default gen_random_uuid(),
  text varchar(200) not null,        -- 200자 제한
  lat double precision not null,
  lng double precision not null,
  nickname varchar(20) not null,
  tag varchar(10) default 'memory',  -- 'memory'(기억) | 'tip'(명당/팁)
  created_at timestamptz default now(),
  is_hidden boolean default false    -- 신고/필터 숨김용
);
```
- 조회: 현재 좌표 기준 bounding box 쿼리(±0.0005도 ≈ 50m) → 클라이언트에서 정확한 거리 계산(Haversine).
- 쓰기 제한: GPS accuracy 50m 이하일 때만 작성 허용 (장소 펜스의 최소 구현).
- 캠퍼스 펜스: v0에서는 건국대 중심좌표(37.5408, 127.0793) 반경 1km 내에서만 작성 가능하도록 클라이언트+DB 체크.

## 화면 (총 3개, 그 이상 만들지 말 것)
1. **랜딩**: 서비스 한 줄 소개 + 닉네임 입력 + [AR 시작] 버튼(권한 요청 트리거).
2. **AR 뷰** (메인): 카메라 배경 + 떠 있는 텍스트들 + 하단 [✍️ 여기에 남기기] 버튼.
3. **작성 모달**: placeholder = "이 장소의 기억을 남겨보세요 — 예: 여기서 처음 고백했던 날" / 태그 선택(💌 기억 / 📍 명당·팁) / 법적 고지 1줄("작성 정보는 보관되며, 타인 비방 시 법적 책임이 따를 수 있습니다").

## 마일스톤 (순서 엄수, 하나 끝나면 멈추고 보고)
- **M1 — 오늘 필드 테스트용 최소 동작**: 카메라 배경 + GPS/나침반으로 하드코딩된 좌표 3곳(아래)에 더미 텍스트 렌더. DB 없이 로컬 배열로.
  - 테스트 좌표는 사용자가 현장에서 채울 수 있게 `test_points.js`로 분리.
- **M2 — 쓰기/읽기**: Supabase 연동, 작성 모달, 주변 메시지 로드.
- **M3 — 다듬기**: 지도 목록 뷰(Kakao Maps), 거리 뱃지, 겹침 처리, 신고 버튼(is_hidden 토글).
- **M4 — 정식화**: Kakao OAuth, LLM 필터(작성 시점), 캠퍼스 펜스 강화.

## 테스트 방법 (필드 테스트 체크리스트)
1. Vercel에 배포 → 폰에서 접속 (iOS/Android 둘 다).
2. 열린 공간(일감호변 등)에서: 더미 텍스트가 해당 방향에 뜨는가? 몸을 돌리면 따라오지 않고 공간에 고정되는가?
3. 10~20m 걸어가면 텍스트가 가까워지는가/멀어지는가?
4. 건물 옆/나무 아래에서 GPS accuracy 얼마나 나빠지는지 기록.
5. 나침반 오차 체크: 실제 방향과 표시 방향 차이 체감 기록.

## 코드 컨벤션
- 작은 모듈로 분리: `ar/` (three.js 씬, 센서), `data/` (Supabase), `ui/`.
- 센서(GPS/나침반) 값은 디버그 오버레이로 화면 좌상단에 항상 표시 (PoC 동안): lat/lng/accuracy/heading.
- 주석은 한국어 OK. 환경변수는 `.env`(Supabase URL/anon key), 커밋 금지.
