import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  extractQrToken,
  formatCameraError,
  checkCameraSupport,
} from "../client/src/lib/qr-scanner-helper.ts";

describe("QR Token Extraction (extractQrToken)", () => {
  it("extracts token from URL with ?t= parameter", () => {
    const url = "https://job-tracker-6evs.onrender.com/checkin?t=tok_tester_123456";
    assert.equal(extractQrToken(url), "tok_tester_123456");
  });

  it("extracts token from URL with ?qrToken= parameter", () => {
    const url = "https://job-tracker-6evs.onrender.com/login?qrToken=tok_tester_789";
    assert.equal(extractQrToken(url), "tok_tester_789");
  });

  it("extracts token from URL with ?token= parameter", () => {
    const url = "https://job-tracker-6evs.onrender.com/checkin?token=tok_abc_999";
    assert.equal(extractQrToken(url), "tok_abc_999");
  });

  it("extracts token from URL without http protocol prefix", () => {
    const rawUrl = "job-tracker-6evs.onrender.com/checkin?t=tok_tester_555";
    assert.equal(extractQrToken(rawUrl), "tok_tester_555");
  });

  it("returns literal raw string if scanned text is a direct token", () => {
    const directToken = "tok_raw_direct_999";
    assert.equal(extractQrToken(directToken), "tok_raw_direct_999");
  });

  it("returns null for empty or non-string input", () => {
    assert.equal(extractQrToken(""), null);
    assert.equal(extractQrToken("   "), null);
  });
});

describe("Camera Error Formatting (formatCameraError)", () => {
  it("formats NotAllowedError / permission denied cleanly", () => {
    const err = { name: "NotAllowedError", message: "Permission denied" };
    const formatted = formatCameraError(err);
    assert.match(formatted, /permission/i);
    assert.match(formatted, /settings/i);
  });

  it("formats NotFoundError cleanly", () => {
    const err = { name: "NotFoundError", message: "Requested device not found" };
    const formatted = formatCameraError(err);
    assert.match(formatted, /No camera found/i);
  });

  it("formats NotReadableError cleanly", () => {
    const err = { name: "NotReadableError", message: "Could not start video source" };
    const formatted = formatCameraError(err);
    assert.match(formatted, /in use by another application/i);
  });
});

describe("Camera Support Checking (checkCameraSupport)", () => {
  it("returns non-supported in Node environment without window", () => {
    const support = checkCameraSupport();
    assert.equal(support.supported, false);
    assert.match(support.error!, /Window is not defined/i);
  });
});
