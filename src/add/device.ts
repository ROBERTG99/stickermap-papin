/** Device location for "Usar mi ubicación" and for a photo just taken with the camera (BUILD.md §7.3 rule 2). */
export interface DeviceFix {
  lat: number;
  lng: number;
  /** Metres (68 % confidence radius reported by the browser). */
  accuracyM: number;
}

export type DeviceErrorKind = "denied" | "unavailable" | "timeout";

export class DeviceError extends Error {
  constructor(public kind: DeviceErrorKind) {
    super(kind);
  }
}

export function getDeviceFix(): Promise<DeviceFix> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new DeviceError("unavailable"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: p.coords.accuracy }),
      (e) => reject(new DeviceError(e.code === e.PERMISSION_DENIED ? "denied" : e.code === e.TIMEOUT ? "timeout" : "unavailable")),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  });
}
