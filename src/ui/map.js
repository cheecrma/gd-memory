// Kakao Maps 목록(지도) 뷰.
// 무료지만 JavaScript 앱 키 필요: VITE_KAKAO_MAP_KEY (.env)
// 컨셉: 지도에는 "제목"만 보이고, 내용은 그 자리 AR에서만.

const KAKAO_KEY = import.meta.env.VITE_KAKAO_MAP_KEY;

let sdkPromise = null;
let map = null;
let markers = [];
let infoWindow = null;

// Kakao SDK를 동적으로 1회 로드.
function loadSdk() {
  if (!KAKAO_KEY) return Promise.reject(new Error('NO_KEY'));
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const fail = (err) => {
      sdkPromise = null; // 실패 시 캐시 비워 재시도 가능하게
      reject(err);
    };
    const s = document.createElement('script');
    s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_KEY}&autoload=false`;
    s.onload = () => {
      // 스크립트는 받았지만 kakao 객체가 없으면 키/도메인 거부일 수 있음
      if (!window.kakao || !window.kakao.maps) {
        fail(new Error('SDK_NO_KAKAO'));
        return;
      }
      try {
        window.kakao.maps.load(() => resolve(window.kakao));
      } catch (err) {
        fail(err);
      }
    };
    s.onerror = () => fail(new Error('SDK_LOAD_FAIL'));
    document.head.appendChild(s);
  });
  return sdkPromise;
}

const TAG_EMOJI = { memory: '💌', tip: '📍' };

// 지도 열기: 현재 위치 중심 + 주변 글들의 제목 마커.
// rows: [{ id, title, text, lat, lng, nickname, tag }]
export async function openMap(center, rows) {
  const notice = document.getElementById('map-notice');
  notice.classList.add('hidden');

  let kakao;
  try {
    kakao = await loadSdk();
  } catch (e) {
    notice.classList.remove('hidden');
    if (e.message === 'NO_KEY') {
      notice.innerHTML =
        '지도 키가 설정되지 않았어요.<br>.env 에 VITE_KAKAO_MAP_KEY 를 넣고 서버를 재시작하세요.';
    } else {
      notice.innerHTML =
        '지도를 불러오지 못했어요.<br>' +
        `<small>(${e.message})</small><br><br>` +
        `현재 접속 주소:<br><b>${location.origin}</b><br><br>` +
        '이 주소가 카카오 [JavaScript 키 →<br>JavaScript SDK 도메인]에 등록돼 있어야 해요.<br>' +
        '방금 등록했다면 1~2분 뒤 다시 시도해보세요.<br>' +
        '브라우저 광고/추적 차단도 꺼보세요.';
    }
    return;
  }

  try {
    buildMap(kakao, center, rows);
  } catch (e) {
    notice.classList.remove('hidden');
    notice.innerHTML =
      '지도 생성 중 오류:<br><small>' +
      (e.message || e) +
      `</small><br><br>현재 접속 주소:<br><b>${location.origin}</b>`;
  }
}

function buildMap(kakao, center, rows) {
  const el = document.getElementById('kakao-map');
  const c = new kakao.maps.LatLng(center.lat, center.lng);

  if (!map) {
    map = new kakao.maps.Map(el, { center: c, level: 3 });
    infoWindow = new kakao.maps.InfoWindow({ zIndex: 1 });
  } else {
    map.setCenter(c);
    map.relayout(); // 화면 표시 후 크기 보정
  }

  // 내 위치 마커
  clearMarkers();
  const me = new kakao.maps.Marker({
    position: c,
    image: new kakao.maps.MarkerImage(
      'data:image/svg+xml;base64,' +
        btoa(
          '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22"><circle cx="11" cy="11" r="7" fill="#5b8def" stroke="#fff" stroke-width="3"/></svg>'
        ),
      new kakao.maps.Size(22, 22)
    ),
  });
  me.setMap(map);
  markers.push(me);

  // 글 마커 (제목만)
  for (const row of rows) {
    const pos = new kakao.maps.LatLng(row.lat, row.lng);
    const marker = new kakao.maps.Marker({ position: pos, map });
    const emoji = TAG_EMOJI[row.tag] || '💌';
    const title =
      row.title && row.title.trim() ? row.title : row.text;
    kakao.maps.event.addListener(marker, 'click', () => {
      infoWindow.setContent(
        `<div style="padding:8px 12px;font-size:13px;max-width:200px;color:#111;">
           ${emoji} <b>${escapeHtml(title)}</b><br>
           <span style="color:#666;">그 자리에 가서 카메라로 내용 보기</span>
         </div>`
      );
      infoWindow.open(map, marker);
    });
    markers.push(marker);
  }
}

function clearMarkers() {
  markers.forEach((m) => m.setMap(null));
  markers = [];
  if (infoWindow) infoWindow.close();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}
