import { Html5Qrcode } from "html5-qrcode";

export function extractQrToken(decodedText: string): string | null {
  if (!decodedText || typeof decodedText !== "string") return null;
  const trimmed = decodedText.trim();
  if (!trimmed) return null;

  // Standard URL extraction
  try {
    const urlStr = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(urlStr);
    const token =
      url.searchParams.get("t") ||
      url.searchParams.get("qrToken") ||
      url.searchParams.get("token") ||
      url.searchParams.get("tok");
    if (token && token.trim().length > 0) return token.trim();
  } catch {
    // ignore
  }

  // Query parameter regex fallback (e.g. ?t=..., &t=...)
  const paramMatch = trimmed.match(/(?:[?&])(?:t|qrToken|token|tok)=([^&]+)/i);
  if (paramMatch && paramMatch[1]) {
    try {
      const decoded = decodeURIComponent(paramMatch[1]).trim();
      if (decoded) return decoded;
    } catch {
      return paramMatch[1].trim();
    }
  }

  return trimmed;
}

export function checkCameraSupport(): { supported: boolean; error?: string } {
  if (typeof window === "undefined") {
    return { supported: false, error: "Window is not defined." };
  }

  if (
    window.isSecureContext === false &&
    window.location.hostname !== "localhost" &&
    window.location.hostname !== "127.0.0.1"
  ) {
    return {
      supported: false,
      error: "Camera access requires HTTPS. Please access Job Tracker over https://",
    };
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return {
      supported: false,
      error:
        "Camera access is not supported by this browser or requires a secure connection (HTTPS).",
    };
  }

  return { supported: true };
}

export function formatCameraError(err: any): string {
  const errorName = err?.name || "";
  const errorStr = String(err?.message || err || "");

  if (
    errorName === "NotAllowedError" ||
    errorName === "PermissionDeniedError" ||
    /permission|denied|allowed/i.test(errorStr)
  ) {
    return "Camera permission was denied. Please allow camera permissions in browser site settings and try again.";
  }
  if (
    errorName === "NotFoundError" ||
    errorName === "DevicesNotFoundError" ||
    /not found|no camera/i.test(errorStr)
  ) {
    return "No camera found on your device.";
  }
  if (
    errorName === "NotReadableError" ||
    errorName === "TrackStartError" ||
    /in use|readable/i.test(errorStr)
  ) {
    return "Camera is currently in use by another application.";
  }
  if (errorName === "OverconstrainedError" || /constraint/i.test(errorStr)) {
    return "Camera constraint error. Try switching cameras or grant permissions.";
  }

  return `Could not start camera: ${errorStr || "Permission denied or camera unavailable."}`;
}

export async function startQrScanner(
  elementId: string,
  onScanSuccess: (token: string, rawText: string) => void,
  onScanError?: (errorMessage: string) => void,
): Promise<Html5Qrcode> {
  const support = checkCameraSupport();
  if (!support.supported) {
    throw new Error(support.error);
  }

  const container = document.getElementById(elementId);
  if (!container) {
    throw new Error(`Scanner DOM element '${elementId}' not found.`);
  }

  // Pre-request camera permission explicitly using getUserMedia to trigger browser prompt cleanly
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
    });
    // Stop temporary stream tracks immediately
    stream.getTracks().forEach((track) => track.stop());
  } catch (err: any) {
    console.warn("Explicit getUserMedia permission check error:", err);
    if (
      err?.name === "NotAllowedError" ||
      err?.name === "PermissionDeniedError" ||
      /permission|denied/i.test(String(err?.message || err))
    ) {
      throw new Error(formatCameraError(err));
    }
  }

  const scanner = new Html5Qrcode(elementId);
  const qrConfig = { fps: 10, qrbox: { width: 240, height: 240 } };

  const handleDecoded = (decodedText: string) => {
    const token = extractQrToken(decodedText);
    if (token) {
      onScanSuccess(token, decodedText);
    } else if (onScanError) {
      onScanError("This QR code does not look like a Job Tracker site code. Please scan the site QR poster.");
    }
  };

  // Attempt 1: Environment facing mode (rear camera)
  try {
    await scanner.start({ facingMode: "environment" }, qrConfig, handleDecoded, () => undefined);
    return scanner;
  } catch (err1: any) {
    console.warn("Attempt 1 (facingMode: environment) failed:", err1);
  }

  // Attempt 2: Select rear camera from available cameras list
  try {
    const devices = await Html5Qrcode.getCameras();
    if (devices && devices.length > 0) {
      const rearCamera =
        devices.find((d) => /back|rear|environment|main/i.test(d.label)) ||
        devices[devices.length - 1]; // rear camera is typically last
      await scanner.start(rearCamera.id, qrConfig, handleDecoded, () => undefined);
      return scanner;
    }
  } catch (err2: any) {
    console.warn("Attempt 2 (getCameras list) failed:", err2);
  }

  // Attempt 3: Default/user facing mode
  try {
    await scanner.start({ facingMode: "user" }, qrConfig, handleDecoded, () => undefined);
    return scanner;
  } catch (err3: any) {
    console.error("All camera start attempts failed:", err3);
    throw new Error(formatCameraError(err3));
  }
}
