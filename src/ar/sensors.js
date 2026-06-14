// GPS(Geolocation) + 나침반(DeviceOrientation) 센서 래퍼.
// CLAUDE.md 제약 3·4 반영: iOS/Android 분기, watchPosition, 권한 요청.

export class Sensors {
  constructor() {
    this.position = null; // { lat, lng, accuracy }
    this.heading = 0; // 0=북, 시계방향 (도)
    this.pitch = 90; // beta: 폰을 수직으로 들면 ~90
    this.hasOrientation = false;
    this.hasPosition = false;

    this._watchId = null;
    this._onPosition = () => {};
    this._onHeading = () => {};

    this._handleOrientation = this._handleOrientation.bind(this);
  }

  onPosition(cb) {
    this._onPosition = cb;
  }
  onHeading(cb) {
    this._onHeading = cb;
  }

  // 사용자 탭 이벤트 안에서 호출해야 함 (iOS requestPermission 제약).
  async requestPermissions() {
    // iOS 13+ : 방향 센서 권한 명시 요청
    const DOE = window.DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === 'function') {
      try {
        const res = await DOE.requestPermission();
        if (res !== 'granted') {
          throw new Error('방향 센서 권한이 거부되었습니다.');
        }
      } catch (e) {
        throw new Error('방향 센서 권한 요청 실패: ' + e.message);
      }
    }
  }

  start() {
    this._startOrientation();
    this._startGeolocation();
  }

  stop() {
    if (this._watchId != null) {
      navigator.geolocation.clearWatch(this._watchId);
      this._watchId = null;
    }
    window.removeEventListener('deviceorientationabsolute', this._handleOrientation);
    window.removeEventListener('deviceorientation', this._handleOrientation);
  }

  _startOrientation() {
    // Android: 'deviceorientationabsolute'가 진북 기준 alpha 제공.
    // iOS: 'deviceorientation' + webkitCompassHeading.
    // 둘 다 등록해두고 들어오는 값으로 분기 처리한다.
    window.addEventListener('deviceorientationabsolute', this._handleOrientation, true);
    window.addEventListener('deviceorientation', this._handleOrientation, true);
  }

  _handleOrientation(e) {
    let heading = null;

    if (typeof e.webkitCompassHeading === 'number' && !Number.isNaN(e.webkitCompassHeading)) {
      // iOS: 진북 기준, 시계방향. 그대로 사용.
      heading = e.webkitCompassHeading;
    } else if (e.alpha != null) {
      // Android: alpha는 진북 기준 반시계방향 → 시계방향으로 변환.
      // (deviceorientationabsolute 또는 absolute=true일 때 진북 기준)
      heading = (360 - e.alpha) % 360;
    }

    if (heading != null) {
      this.heading = heading;
      this.hasOrientation = true;
    }
    if (e.beta != null) {
      this.pitch = e.beta;
    }
    this._onHeading(this.heading);
  }

  _startGeolocation() {
    if (!('geolocation' in navigator)) {
      this._onPosition(null, new Error('이 기기는 위치 기능을 지원하지 않습니다.'));
      return;
    }
    this._watchId = navigator.geolocation.watchPosition(
      (pos) => {
        this.position = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        };
        this.hasPosition = true;
        this._onPosition(this.position, null);
      },
      (err) => {
        this._onPosition(null, err);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 15000,
      }
    );
  }
}
