import './style.css';
import { Sensors } from './ar/sensors.js';
import { ARScene } from './ar/scene.js';
import { TEST_POINTS } from './data/test_points.js';
import {
  hasSupabase,
  fetchNearby,
  insertMemory,
  reportMemory,
} from './data/supabase.js';
import { haversine, offsetCoord } from './ar/geo.js';
import {
  CAMPUS,
  WRITE_MAX_ACCURACY_M,
  REFETCH_MOVE_M,
  MAX_NICK,
  WRITE_FORWARD_OFFSET_M,
} from './data/config.js';
import { showDebug, updateDebug, setGpsWarning, toast } from './ui/overlay.js';
import { openMap } from './ui/map.js';

const $ = (id) => document.getElementById(id);

const landing = $('landing');
const startBtn = $('start-btn');
const nicknameInput = $('nickname');
const camVideo = $('cam');
const arRoot = $('ar-root');
const arUI = $('ar-ui');
const leaveBtn = $('leave-btn');
const mapBtn = $('map-btn');

// 작성 모달 요소
const writeModal = $('write-modal');
const writeTitle = $('write-title');
const titleNow = $('title-now');
const writeText = $('write-text');
const charNow = $('char-now');
const writeCancel = $('write-cancel');
const writeSubmit = $('write-submit');
const tagBtns = document.querySelectorAll('.tag-btn');

// 상세 모달 요소
const detailModal = $('detail-modal');
const detailTag = $('detail-tag');
const detailDist = $('detail-dist');
const detailTitle = $('detail-title');
const detailText = $('detail-text');
const detailNick = $('detail-nick');
const detailReport = $('detail-report');
const detailClose = $('detail-close');

// 지도 화면 요소
const mapScreen = $('map-screen');
const mapBack = $('map-back');

let sensors = null;
let scene = null;

const state = {
  nickname: '',
  currentPos: null, // { lat, lng, accuracy }
  lastFetchPos: null,
  writeTag: 'memory',
  loading: false,
  rows: [], // 마지막으로 불러온 주변 글 (지도용)
  detailId: null, // 상세 모달에 띄운 글 id (신고용)
};

startBtn.addEventListener('click', onStart);

// ─────────────────────────── 시작 ───────────────────────────
async function onStart() {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    toast(
      'HTTPS에서만 카메라·센서가 동작해요. https:// 주소(자체 인증서 경고는 통과)나 Vercel 배포본으로 접속하세요.',
      7000
    );
    return;
  }

  const nick = (nicknameInput.value || '').trim().slice(0, MAX_NICK);
  if (!nick) {
    toast('닉네임을 입력해주세요.');
    nicknameInput.focus();
    return;
  }
  state.nickname = nick;

  startBtn.disabled = true;
  startBtn.textContent = '권한 요청 중…';

  try {
    // 1) 카메라
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
    });
    camVideo.srcObject = stream;
    await camVideo.play().catch(() => {});

    // 2) 방향 센서 권한 (iOS)
    sensors = new Sensors();
    await sensors.requestPermissions();

    // 3) 씬
    scene = new ARScene(arRoot);
    scene.onLabelTap((point, distance) => openDetail(point, distance));

    sensors.onHeading((h) => {
      scene.setHeading(h);
      refreshDebug();
    });
    sensors.onPosition((pos, err) => {
      if (err) {
        toast('위치를 가져오지 못했어요: ' + err.message);
        return;
      }
      state.currentPos = pos;
      scene.setUserPosition(pos);
      handleAccuracy(pos.accuracy);
      maybeRefetch(pos);
      refreshDebug();
    });
    sensors.start();

    // 4) 화면 전환
    landing.classList.add('hidden');
    arUI.classList.remove('hidden');
    mapBtn.classList.remove('hidden');
    showDebug();
    refreshDebug();
    toast('나침반이 어긋나면 폰을 ∞(8자)로 흔들어 보정하세요', 4500);

    if (!hasSupabase) {
      // DB 미설정 → 로컬 더미로 동작 (M1처럼). .env 설정하면 실데이터로 전환.
      scene.setPoints(TEST_POINTS);
      state.rows = TEST_POINTS;
      toast('DB 미설정: 더미 데이터로 표시 중 (.env 설정 시 실데이터)', 5000);
    }
  } catch (e) {
    console.error(e);
    startBtn.disabled = false;
    startBtn.textContent = 'AR 시작';
    toast('시작 실패: ' + (e.message || e), 5000);
  }
}

// ─────────────────────── 주변 메시지 로드 ───────────────────────
function maybeRefetch(pos) {
  if (!hasSupabase) return;
  const moved =
    !state.lastFetchPos ||
    haversine(pos.lat, pos.lng, state.lastFetchPos.lat, state.lastFetchPos.lng) >
      REFETCH_MOVE_M;
  if (moved && !state.loading) loadNearby(pos);
}

async function loadNearby(pos, announceEmpty = false) {
  if (!hasSupabase || !scene) return;
  state.loading = true;
  try {
    const rows = await fetchNearby(pos.lat, pos.lng);
    scene.setPoints(rows);
    state.rows = rows;
    state.lastFetchPos = { lat: pos.lat, lng: pos.lng };
    refreshDebug();
    if (announceEmpty && rows.length === 0) {
      toast('주변에 아직 글이 없어요. 처음으로 남겨보세요!', 4000);
    }
  } catch (e) {
    console.error(e);
    toast('메시지 로드 실패: ' + e.message, 5000);
  } finally {
    state.loading = false;
  }
}

// ─────────────────────────── 작성 ───────────────────────────
leaveBtn.addEventListener('click', () => {
  const reason = writeBlockReason(state.currentPos);
  if (reason) {
    toast(reason, 4500);
    return;
  }
  openModal();
});

writeCancel.addEventListener('click', closeModal);

writeTitle.addEventListener('input', () => {
  titleNow.textContent = writeTitle.value.length;
});
writeText.addEventListener('input', () => {
  charNow.textContent = writeText.value.length;
});

tagBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    tagBtns.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    state.writeTag = btn.dataset.tag;
  });
});

writeSubmit.addEventListener('click', onSubmit);

function writeBlockReason(pos) {
  if (!hasSupabase) return 'DB가 설정되지 않았어요 (.env 설정 후 다시 시작하세요).';
  if (!pos) return '위치를 아직 못 잡았어요. 잠시 후 다시 시도하세요.';
  if (pos.accuracy > WRITE_MAX_ACCURACY_M)
    return `GPS 정확도가 낮아요 (±${Math.round(pos.accuracy)}m). 열린 곳에서 다시 시도하세요.`;
  if (CAMPUS.fenceEnabled) {
    const d = haversine(pos.lat, pos.lng, CAMPUS.center.lat, CAMPUS.center.lng);
    if (d > CAMPUS.radiusM) return '건국대 캠퍼스 근처에서만 글을 남길 수 있어요.';
  }
  return null;
}

function openModal() {
  writeTitle.value = '';
  titleNow.textContent = '0';
  writeText.value = '';
  charNow.textContent = '0';
  state.writeTag = 'memory';
  tagBtns.forEach((b) => b.classList.toggle('active', b.dataset.tag === 'memory'));
  writeModal.classList.remove('hidden');
  setTimeout(() => writeTitle.focus(), 50);
}

function closeModal() {
  writeModal.classList.add('hidden');
}

async function onSubmit() {
  const pos = state.currentPos;
  const reason = writeBlockReason(pos);
  if (reason) {
    toast(reason, 4500);
    return;
  }
  const title = writeTitle.value.trim();
  const text = writeText.value.trim();
  if (!title) {
    toast('제목을 입력해주세요.');
    writeTitle.focus();
    return;
  }
  if (!text) {
    toast('내용을 입력해주세요.');
    writeText.focus();
    return;
  }

  writeSubmit.disabled = true;
  writeSubmit.textContent = '남기는 중…';
  try {
    // 내 위치 그대로가 아니라 "바라보는 방향으로 살짝 앞"에 저장 →
    // 작성 직후 코앞에 박히지 않고 정면에 떠 보인다.
    const heading = sensors?.hasOrientation ? sensors.heading : 0;
    const place = offsetCoord(pos.lat, pos.lng, heading, WRITE_FORWARD_OFFSET_M);
    await insertMemory({
      title,
      text,
      lat: place.lat,
      lng: place.lng,
      nickname: state.nickname,
      tag: state.writeTag,
    });
    closeModal();
    toast('남겼어요! 이 자리에 글이 떠올라요 ✨', 3500);
    // 방금 쓴 글이 바로 보이도록 강제 재조회
    state.lastFetchPos = null;
    await loadNearby(pos);
  } catch (e) {
    console.error(e);
    toast('저장 실패: ' + e.message, 5000);
  } finally {
    writeSubmit.disabled = false;
    writeSubmit.textContent = '남기기';
  }
}

// ─────────────────── 상세 보기 (말풍선 탭) ───────────────────
const TAG_LABEL = {
  memory: '💌 기억',
  tip: '📍 명당·팁',
};

function openDetail(point, distance) {
  state.detailId = point.id || null;
  detailTag.textContent = TAG_LABEL[point.tag] || TAG_LABEL.memory;
  detailDist.textContent = `약 ${Math.round(distance)}m`;
  detailTitle.textContent =
    point.title && point.title.trim() ? point.title : '(제목 없음)';
  detailText.textContent = point.text;
  detailNick.textContent = `— ${point.nickname}`;
  // 신고는 DB 글(id 있음)에만 가능
  detailReport.style.display = state.detailId ? '' : 'none';
  detailModal.classList.remove('hidden');
}

detailClose.addEventListener('click', () => {
  detailModal.classList.add('hidden');
});

detailReport.addEventListener('click', async () => {
  if (!state.detailId) return;
  if (!confirm('이 글을 신고해서 숨길까요?')) return;
  detailReport.disabled = true;
  try {
    await reportMemory(state.detailId);
    detailModal.classList.add('hidden');
    toast('신고되어 숨김 처리됐어요.', 3500);
    state.lastFetchPos = null;
    if (state.currentPos) await loadNearby(state.currentPos);
  } catch (e) {
    console.error(e);
    toast('신고 실패: ' + e.message, 5000);
  } finally {
    detailReport.disabled = false;
  }
});

// ─────────────────────────── 지도 ───────────────────────────
mapBtn.addEventListener('click', () => {
  if (!state.currentPos) {
    toast('위치를 아직 못 잡았어요.');
    return;
  }
  mapScreen.classList.remove('hidden');
  // 지도는 표시된 뒤 크기를 잡아야 해서 다음 틱에 그린다.
  setTimeout(() => openMap(state.currentPos, state.rows), 30);
});

mapBack.addEventListener('click', () => {
  mapScreen.classList.add('hidden');
});

// ─────────────────────────── 보조 ───────────────────────────
function handleAccuracy(accuracy) {
  setGpsWarning(accuracy != null && accuracy > 30);
}

function refreshDebug() {
  if (!sensors) return;
  const p = sensors.position;
  updateDebug({
    lat: p?.lat,
    lng: p?.lng,
    accuracy: p?.accuracy,
    heading: sensors.hasOrientation ? sensors.heading : null,
    count: scene ? scene.labels.length : 0,
    nearest: scene ? scene.nearestDistance() : null,
  });
}
