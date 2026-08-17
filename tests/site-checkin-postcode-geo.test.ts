/**
 * Focused tests for Site QR + GPS automatic UK postcode lookup,
 * validation, and resolution for site check-in policy setup.
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  extractUkPostcode,
  normalizePostcode,
  lookupExactUkPostcode,
  lookupUkPostcodeOrAddress,
} from "../client/src/lib/geo-utils.ts";

test("extractUkPostcode extracts valid UK postcodes from address strings", () => {
  assert.equal(extractUkPostcode("15 Gilbert Road, Belvedere, DA17 5DB"), "DA17 5DB");
  assert.equal(extractUkPostcode("165 Powis Street, Woolwich, SE18 6JW"), "SE18 6JW");
  assert.equal(extractUkPostcode("38 Crescent Road, SE18 7BN"), "SE18 7BN");
  assert.equal(extractUkPostcode("SE18 6JW"), "SE18 6JW");
  assert.equal(extractUkPostcode("No postcode street name"), null);
  assert.equal(extractUkPostcode(""), null);
  assert.equal(extractUkPostcode(null), null);
});

test("normalizePostcode standardises spacing and letter casing", () => {
  assert.equal(normalizePostcode("da17 5db"), "DA175DB");
  assert.equal(normalizePostcode(" SE18   6JW "), "SE186JW");
  assert.equal(normalizePostcode("se187bn"), "SE187BN");
  assert.equal(normalizePostcode(""), "");
});

test("Target Site 1: 15 Gilbert Road, Belvedere, DA17 5DB resolves to Belvedere / Bexley area", async () => {
  const result = await lookupExactUkPostcode("DA17 5DB");
  assert.ok(result, "Postcode lookup should return a result");
  assert.equal(result.matchType, "exact_postcode");
  assert.equal(result.isValidatedPostcode, true);
  assert.equal(normalizePostcode(result.postcode), "DA175DB");
  
  // Latitude ~ 51.4911, Longitude ~ 0.1474
  assert.ok(result.latitude > 51.48 && result.latitude < 51.50, `Latitude out of expected range: ${result.latitude}`);
  assert.ok(result.longitude > 0.13 && result.longitude < 0.16, `Longitude out of expected range: ${result.longitude}`);
  
  // Confirm correct local area (Bexley / Belvedere)
  assert.equal(result.adminDistrict, "Bexley");
  assert.equal(result.adminWard, "Belvedere");
});

test("Target Site 2: 165 Powis Street, Woolwich, SE18 6JW resolves to Woolwich Arsenal / Greenwich area", async () => {
  const result = await lookupExactUkPostcode("SE18 6JW");
  assert.ok(result, "Postcode lookup should return a result");
  assert.equal(result.matchType, "exact_postcode");
  assert.equal(result.isValidatedPostcode, true);
  assert.equal(normalizePostcode(result.postcode), "SE186JW");
  
  // Latitude ~ 51.4926, Longitude ~ 0.0618
  assert.ok(result.latitude > 51.48 && result.latitude < 51.51, `Latitude out of expected range: ${result.latitude}`);
  assert.ok(result.longitude > 0.05 && result.longitude < 0.08, `Longitude out of expected range: ${result.longitude}`);
  
  // Confirm correct local area (Greenwich / Woolwich Arsenal)
  assert.equal(result.adminDistrict, "Greenwich");
  assert.ok(result.adminWard?.includes("Woolwich") || result.adminWard?.includes("Arsenal"), `Ward mismatch: ${result.adminWard}`);
});

test("Target Site 3: 38 Crescent Road, SE18 7BN resolves to Woolwich Common / Greenwich area", async () => {
  const result = await lookupExactUkPostcode("SE18 7BN");
  assert.ok(result, "Postcode lookup should return a result");
  assert.equal(result.matchType, "exact_postcode");
  assert.equal(result.isValidatedPostcode, true);
  assert.equal(normalizePostcode(result.postcode), "SE187BN");
  
  // Latitude ~ 51.4866, Longitude ~ 0.0688
  assert.ok(result.latitude > 51.47 && result.latitude < 51.50, `Latitude out of expected range: ${result.latitude}`);
  assert.ok(result.longitude > 0.05 && result.longitude < 0.08, `Longitude out of expected range: ${result.longitude}`);
  
  // Confirm correct local area (Greenwich / Woolwich Common)
  assert.equal(result.adminDistrict, "Greenwich");
  assert.ok(result.adminWard?.includes("Woolwich") || result.adminWard?.includes("Common"), `Ward mismatch: ${result.adminWard}`);
});

test("lookupUkPostcodeOrAddress prioritises exact UK postcode lookup FIRST over general Nominatim search", async () => {
  const fullAddress = "15 Gilbert Road, Belvedere, DA17 5DB";
  const result = await lookupUkPostcodeOrAddress(fullAddress, "DA17 5DB");
  
  assert.ok(result, "Result should be returned");
  assert.equal(result.matchType, "exact_postcode");
  assert.equal(result.isValidatedPostcode, true);
  assert.equal(normalizePostcode(result.postcode), "DA175DB");
});

test("lookupUkPostcodeOrAddress validates returned postcode against target postcode", async () => {
  const result = await lookupUkPostcodeOrAddress("Some location", "SE18 6JW");
  assert.ok(result);
  assert.equal(result.isValidatedPostcode, true);
});

test("lookupUkPostcodeOrAddress handles invalid / non-existent postcode gracefully", async () => {
  const result = await lookupUkPostcodeOrAddress("Invalid Location Nonexistent Place", "ZZ99 9ZZ");
  // Should fail exact lookup and either return null or nominatim fallback with isValidatedPostcode=false
  if (result) {
    assert.equal(result.isValidatedPostcode, false);
  } else {
    assert.equal(result, null);
  }
});
