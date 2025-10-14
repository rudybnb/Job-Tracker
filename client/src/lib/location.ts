import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";

export type GPSFix = {
  latitude: number;
  longitude: number;
  accuracy?: number;
};

export async function getCurrentLocation(): Promise<GPSFix> {
  if (Capacitor.isNativePlatform()) {
    const perm = await Geolocation.requestPermissions();
    // On Android, when status is 'granted', we can proceed
    const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true });
    return {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracy: pos.coords.accuracy ?? undefined,
    };
  }

  return new Promise<GPSFix>((resolve, reject) => {
    if (!navigator.geolocation) {
      return reject(new Error("Geolocation not supported"));
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? undefined,
        });
      },
      (err) => reject(new Error(err.message || "Failed to get location")),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}