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

export function checkCameraSupport(): { supported: boolean; error?: string; code?: string } {
  if (typeof window === "undefined") {
    return { supported: false, error: "Window is not defined.", code: "ENVIRONMENT_ERROR" };
  }

  if (
    window.isSecureContext === false &&
    window.location.hostname !== "localhost" &&
    window.location.hostname !== "127.0.0.1"
  ) {
    return {
      supported: false,
      error: "Camera access requires HTTPS. Please access Job Tracker over https://",
      code: "SECURE_CONTEXT_REQUIRED",
    };
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return {
      supported: false,
      error:
        "Camera access is not supported by this browser or requires a secure connection (HTTPS).",
      code: "GETUSERMEDIA_UNSUPPORTED",
    };
  }

  return { supported: true };
}

export function formatCameraError(err: any): { message: string; code: string } {
  const errorName = err?.name || "";
  const errorStr = String(err?.message || err || "");

  if (
    errorName === "NotAllowedError" ||
    errorName === "PermissionDeniedError" ||
    /permission|denied|allowed/i.test(errorStr)
  ) {
    return {
      message: "Camera permission was denied. Please allow camera permissions in browser site settings and try again.",
      code: "CAMERA_PERMISSION_DENIED",
    };
  }
  if (
    errorName === "NotFoundError" ||
    errorName === "DevicesNotFoundError" ||
    /not found|no camera/i.test(errorStr)
  ) {
    return {
      message: "No camera found on your device.",
      code: "NO_CAMERA_FOUND",
    };
  }
  if (
    errorName === "NotReadableError" ||
    errorName === "TrackStartError" ||
    /in use|readable/i.test(errorStr)
  ) {
    return {
      message: "Camera is currently in use by another application.",
      code: "CAMERA_IN_USE",
    };
  }

  return {
    message: `Could not start camera: ${errorStr || "Permission denied or camera unavailable."}`,
    code: "CAMERA_START_FAILED",
  };
}

export async function startQrScanner(
  elementId: string,
  onScanSuccess: (token: string, rawText: string) => void,
  onScanError?: (errorMessage: string, errorCode: string) => void,
): Promise<Html5Qrcode> {
  const support = checkCameraSupport();
  if (!support.supported) {
    console.error(`[QR Scanner] Diagnostic Error [${support.code}]: ${support.error}`);
    const err = new Error(support.error);
    (err as any).code = support.code;
    throw err;
  }

  const container = document.getElementById(elementId);
  if (!container) {
    console.error(`[QR Scanner] Diagnostic Error [DOM_ELEMENT_NOT_FOUND]: Scanner element '${elementId}' not found.`);
    const err = new Error(`Scanner DOM element '${elementId}' not found.`);
    (err as any).code = "DOM_ELEMENT_NOT_FOUND";
    throw err;
  }

  const qrConfig = { fps: 10, qrbox: { width: 240, height: 240 } };

  const handleDecoded = (decodedText: string) => {
    console.log("[QR Scanner] Code scanned successfully.");
    const token = extractQrToken(decodedText);
    if (token) {
      onScanSuccess(token, decodedText);
    } else {
      console.warn("[QR Scanner] Diagnostic Warning [INVALID_QR_TOKEN]: Scanned text produced no valid token.");
      if (onScanError) {
        onScanError(
          "This QR code does not look like a Job Tracker site code. Please scan the official site QR poster.",
          "INVALID_QR_TOKEN",
        );
      }
    }
  };

  // 1. Identify camera target once without repeated open/closes
  let cameraTarget: string | { facingMode: string } = { facingMode: "environment" };
  try {
    const devices = await Html5Qrcode.getCameras();
    if (devices && devices.length > 0) {
      const rearCamera =
        devices.find((d) => /back|rear|environment|main/i.test(d.label)) ||
        devices[devices.length - 1];
      if (rearCamera && rearCamera.id) {
        cameraTarget = rearCamera.id;
      }
    }
  } catch {
    // If getCameras fails or is restricted, use generic facingMode
    cameraTarget = { facingMode: "environment" };
  }

  // 2. Start Html5Qrcode ONCE with selected camera
  const scanner = new Html5Qrcode(elementId);
  try {
    await scanner.start(cameraTarget, qrConfig, handleDecoded, () => undefined);
    console.log("[QR Scanner] Camera started successfully (single start).");
    return scanner;
  } catch (err: any) {
    // If direct device ID failed, cleanly clear and retry ONCE with fresh instance and generic facingMode
    try {
      await scanner.clear();
    } catch {
      // ignore clear error
    }

    if (typeof cameraTarget === "string") {
      const fallbackScanner = new Html5Qrcode(elementId);
      try {
        await fallbackScanner.start({ facingMode: "environment" }, qrConfig, handleDecoded, () => undefined);
        console.log("[QR Scanner] Camera started successfully on clean fallback instance.");
        return fallbackScanner;
      } catch (fallbackErr: any) {
        try {
          await fallbackScanner.clear();
        } catch {
          // ignore
        }
        const formatted = formatCameraError(fallbackErr || err);
        const error = new Error(formatted.message);
        (error as any).code = formatted.code;
        throw error;
      }
    }

    const formatted = formatCameraError(err);
    const error = new Error(formatted.message);
    (error as any).code = formatted.code;
    throw error;
  }
}
