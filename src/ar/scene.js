import * as THREE from 'three';
import { Label } from './label.js';
import { haversine, bearing, toLocalXZ } from './geo.js';
import { MIN_DISPLAY_M } from '../data/config.js';

// three.js 씬: 카메라 = 사용자 눈(원점 고정), 라벨을 GPS 방위/거리로 배치.
// CLAUDE.md 제약 2: 고도 안 씀 → 모든 라벨 y는 눈높이 부근(0~+1m)에 고정.

const LOAD_RADIUS_M = 50; // 반경 50m 내 메시지만 로드
const LABEL_Y = 0.3; // 눈높이 살짝 위에 떠 있는 느낌

export class ARScene {
  constructor(container) {
    this.container = container;

    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setClearColor(0x000000, 0); // 투명 → 뒤 카메라 영상 비침
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();

    // YXZ 순서: yaw(나침반) → pitch(beta) 순으로 적용하기 편함.
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 1000);
    this.camera.rotation.order = 'YXZ';
    this.camera.position.set(0, 0, 0);

    this.labels = [];
    this.points = [];
    this.userPos = null;

    this._heading = 0; // 센서 원시 목표값
    this._pitch = 90;
    this._smoothHeading = null; // 화면에 적용되는 스무딩된 값
    this._smoothPitch = 90;

    // 말풍선 탭(레이캐스트) 처리
    this._raycaster = new THREE.Raycaster();
    this._onLabelTap = null;
    this.renderer.domElement.style.pointerEvents = 'auto';
    this._handleTap = this._handleTap.bind(this);
    this.renderer.domElement.addEventListener('click', this._handleTap);

    this._onResize = this._onResize.bind(this);
    window.addEventListener('resize', this._onResize);
    this._onResize();

    this._animate = this._animate.bind(this);
    this._running = true;
    this.renderer.setAnimationLoop(this._animate);
  }

  // M1: 로컬 배열의 더미 포인트들을 등록.
  setPoints(points) {
    // 기존 라벨 정리
    this.labels.forEach((l) => {
      this.scene.remove(l.sprite);
      l.dispose();
    });
    this.labels = points.map((p) => {
      const label = new Label(p);
      this.scene.add(label.sprite);
      return label;
    });
    this.points = points;
    if (this.userPos) this._reposition();
  }

  // GPS 갱신 → 라벨 위치/거리 다시 계산.
  setUserPosition(pos) {
    this.userPos = pos;
    this._reposition();
  }

  setHeading(deg) {
    this._heading = deg;
  }
  setPitch(deg) {
    this._pitch = deg;
  }

  // 화면에 보이는 라벨 중 가장 가까운 거리(디버그용).
  nearestDistance() {
    if (!this.labels.length) return null;
    return Math.min(...this.labels.map((l) => l.distance));
  }

  _reposition() {
    if (!this.userPos) return;
    const { lat, lng } = this.userPos;

    // 1) 각 라벨의 거리/방위 계산
    for (const label of this.labels) {
      const p = label.point;
      label.distance = haversine(lat, lng, p.lat, p.lng);
      label._brg = bearing(lat, lng, p.lat, p.lng);
      label.sprite.visible = label.distance <= LOAD_RADIUS_M;
    }

    // 2) 같은 방향(겹침) 처리: 방위 15° 버킷으로 묶어, 가까운 것이 아래로
    //    오게 정렬한 뒤 세로로 스택 (CLAUDE.md 제약 1).
    const buckets = new Map();
    for (const label of this.labels) {
      if (!label.sprite.visible) continue;
      const key = Math.round(label._brg / 15);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(label);
    }

    // 3) 위치 적용
    const STACK_GAP = 2.6; // 스택 간 높이 간격(m)
    for (const group of buckets.values()) {
      group.sort((a, b) => a.distance - b.distance);
      group.forEach((label, i) => {
        // 코앞/GPS 떨림으로 거의 0m면 최소 거리로 밀어냄. 뱃지는 실제 거리.
        const shown = Math.max(label.distance, MIN_DISPLAY_M);
        const { x, z } = toLocalXZ(label._brg, shown);
        label.sprite.position.set(x, LABEL_Y + i * STACK_GAP, z);
        label.setDistance(label.distance);
      });
    }
  }

  // 말풍선 탭 콜백 등록: cb(point, distance)
  onLabelTap(cb) {
    this._onLabelTap = cb;
  }

  _handleTap(e) {
    if (!this._onLabelTap) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    this._raycaster.setFromCamera(ndc, this.camera);
    const sprites = this.labels
      .filter((l) => l.sprite.visible)
      .map((l) => l.sprite);
    const hits = this._raycaster.intersectObjects(sprites, false);
    if (!hits.length) return;
    const label = this.labels.find((l) => l.sprite === hits[0].object);
    if (label) this._onLabelTap(label.point, label.distance);
  }

  _animate() {
    // ── 나침반 노이즈 적응형 스무딩 (1€ 필터 방식) ──
    // 자력계 원시값은 실내에서 ±10°씩 튄다. 고정 계수로는
    // "지터 제거"와 "빠른 반응"을 동시에 못 잡으므로,
    // 변화량(dh)에 따라 따라가는 비율(alpha)을 동적으로 바꾼다:
    //   - dh 작음(=미세 떨림) → alpha 작게 → 강하게 눌러 안정
    //   - dh 큼(=실제로 폰을 돌림) → alpha 크게 → 즉각 반응
    if (this._smoothHeading == null) this._smoothHeading = this._heading;
    // 각도 차이를 -180~+180 범위로 정규화해 0/360 경계에서 튀지 않게.
    let dh = ((this._heading - this._smoothHeading + 540) % 360) - 180;
    const absdh = Math.abs(dh);
    // 1.5° 이하 미세 변화는 노이즈로 보고 무시(데드밴드).
    if (absdh < 1.5) dh = 0;
    // 변화가 클수록 alpha↑ (0.02~0.4). 60°면 거의 즉시 따라감.
    const aHead = THREE.MathUtils.clamp(0.02 + (absdh / 60) * 0.45, 0.02, 0.4);
    this._smoothHeading = (this._smoothHeading + dh * aHead + 360) % 360;
    this._smoothPitch += (this._pitch - this._smoothPitch) * 0.2;

    // 나침반 → 카메라 yaw, beta → pitch. roll(z)은 M1에서 무시(세로 파지 가정).
    this.camera.rotation.y = THREE.MathUtils.degToRad(-this._smoothHeading);
    this.camera.rotation.x = THREE.MathUtils.degToRad(this._smoothPitch - 90);
    this.camera.rotation.z = 0;
    this.renderer.render(this.scene, this.camera);
  }

  _onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this._running = false;
    this.renderer.setAnimationLoop(null);
    window.removeEventListener('resize', this._onResize);
    this.renderer.domElement.removeEventListener('click', this._handleTap);
    this.labels.forEach((l) => l.dispose());
    this.renderer.dispose();
  }
}
