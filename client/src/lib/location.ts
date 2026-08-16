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

/** Haversine formula distance calculation in metres */
export function calculateDistanceMetres(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth radius in metres
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}