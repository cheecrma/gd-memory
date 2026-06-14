// GPS 좌표 ↔ 거리/방위각 계산 유틸 (Haversine).
// CLAUDE.md: 고도는 신뢰 불가 → 2D 평면 거리/방위만 사용.

const R = 6371000; // 지구 반지름 (m)
const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;

// 두 좌표 사이의 평면 거리(m).
export function haversine(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// from → to 로 향하는 방위각(도). 0=북, 90=동, 180=남, 270=서 (시계방향).
export function bearing(lat1, lng1, lat2, lng2) {
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lng2 - lng1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// 시작 좌표에서 bearing(도) 방향으로 dist(m) 떨어진 좌표를 반환.
// 작성 시 "내 앞쪽"에 글을 저장할 때 사용.
export function offsetCoord(lat, lng, bearingDeg, distM) {
  const b = toRad(bearingDeg);
  const dLat = (distM * Math.cos(b)) / 111320;
  const dLng = (distM * Math.sin(b)) / (111320 * Math.cos(toRad(lat)));
  return { lat: lat + dLat, lng: lng + dLng };
}

// 방위각+거리 → three.js 월드 좌표(x: 동, z: -북).
// 카메라가 원점(사용자 눈)에 있고 기본으로 -Z(북)를 바라본다고 가정.
export function toLocalXZ(bearingDeg, distM) {
  const b = toRad(bearingDeg);
  return {
    x: distM * Math.sin(b), // 동(+x)
    z: -distM * Math.cos(b), // 북(-z)
  };
}
