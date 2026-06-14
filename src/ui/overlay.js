// 디버그 오버레이 / 경고 배너 / 토스트 — 화면 표시 헬퍼.
// CLAUDE.md: 센서 값(lat/lng/accuracy/heading)을 PoC 동안 상시 좌상단 표시.

const $ = (id) => document.getElementById(id);

export const debugEl = $('debug');
const gpsWarnEl = $('gps-warn');
const toastEl = $('toast');

export function showDebug() {
  debugEl.classList.remove('hidden');
}

export function updateDebug({ lat, lng, accuracy, heading, count, nearest }) {
  const f = (v, d = 6) => (v == null ? '—' : v.toFixed(d));
  debugEl.textContent =
    `lat  ${f(lat)}\n` +
    `lng  ${f(lng)}\n` +
    `acc  ${accuracy == null ? '—' : Math.round(accuracy) + 'm'}\n` +
    `head ${heading == null ? '—' : Math.round(heading) + '°'}\n` +
    `pts  ${count ?? 0}` +
    (nearest == null ? '' : `  (최근 ${Math.round(nearest)}m)`);
}

export function setGpsWarning(show) {
  gpsWarnEl.classList.toggle('hidden', !show);
}

let toastTimer = null;
export function toast(msg, ms = 3500) {
  toastEl.textContent = msg;
  toastEl.classList.remove('hidden');
  toastEl.style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.style.opacity = '0';
    setTimeout(() => toastEl.classList.add('hidden'), 300);
  }, ms);
}
