export interface PostcodeLookupResult {
  latitude: number;
  longitude: number;
  postcode?: string;
  adminDistrict?: string;
  adminWard?: string;
  country?: string;
  matchType: "exact_postcode" | "nominatim";
  isValidatedPostcode?: boolean;
}

/** Extract UK postcode pattern from string */
export function extractUkPostcode(input?: string | null): string | null {
  if (!input) return null;
  const postcodeRegex = /([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})/i;
  const match = input.match(postcodeRegex);
  return match ? match[1].trim().toUpperCase() : null;
}

/** Normalize postcode for string comparison (remove spaces, uppercase) */
export function normalizePostcode(pc?: string | null): string {
  if (!pc) return "";
  return pc.replace(/\s+/g, "").toUpperCase();
}

/** Helper to convert DMS (Degrees Minutes Seconds) coordinate strings to decimal degrees */
export function parseDmsOrDecimal(input: string): number | null {
  if (!input) return null;
  const str = input.trim();

  // Standard decimal parsing
  const num = Number(str);
  if (!Number.isNaN(num)) return num;

  // Regex for DMS: e.g. 51°29'28.7"N or 51 29 28.7 N or 51° 29' 28" N
  const dmsRegex = /^\s*(\d{1,3})\s*[°\s]\s*(\d{1,2})\s*['’\s]\s*(\d{1,2}(?:\.\d+)?)\s*["”\s]?\s*([NSEWnsew])?\s*$/;
  const match = str.match(dmsRegex);
  if (match) {
    const deg = parseFloat(match[1]);
    const min = parseFloat(match[2]);
    const sec = parseFloat(match[3]);
    const dir = match[4] ? match[4].toUpperCase() : "";

    let decimal = deg + min / 60 + sec / 3600;
    if (dir === "S" || dir === "W") {
      decimal = -decimal;
    }
    return decimal;
  }

  return null;
}

/** Lookup exact UK postcode using postcodes.io API */
export async function lookupExactUkPostcode(postcode: string): Promise<PostcodeLookupResult | null> {
  const extracted = extractUkPostcode(postcode) || postcode.trim();
  if (!extracted) return null;

  const cleanPostcode = normalizePostcode(extracted);
  if (!cleanPostcode) return null;

  try {
    const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(cleanPostcode)}`);
    if (res.ok) {
      const data = await res.json();
      if (data.status === 200 && data.result) {
        const returnedPc = data.result.postcode || extracted;
        const normalizedReturned = normalizePostcode(returnedPc);

        return {
          latitude: data.result.latitude,
          longitude: data.result.longitude,
          postcode: returnedPc,
          adminDistrict: data.result.admin_district,
          adminWard: data.result.admin_ward,
          country: data.result.country,
          matchType: "exact_postcode",
          isValidatedPostcode: normalizedReturned === cleanPostcode,
        };
      }
    }
  } catch (err) {
    console.warn("Exact UK postcode lookup failed:", err);
  }

  return null;
}

/** Helper to lookup UK postcode or full address via postcodes.io (exact postcode first) or Nominatim (fallback) */
export async function lookupUkPostcodeOrAddress(
  addressOrPostcode: string,
  targetPostcode?: string
): Promise<PostcodeLookupResult | null> {
  if (!addressOrPostcode && !targetPostcode) return null;

  // 1. Try exact postcode lookup FIRST if targetPostcode or UK postcode pattern is present
  const postcodeToTry = targetPostcode || extractUkPostcode(addressOrPostcode);
  if (postcodeToTry) {
    const exactResult = await lookupExactUkPostcode(postcodeToTry);
    if (exactResult) {
      if (targetPostcode) {
        const expected = normalizePostcode(targetPostcode);
        const actual = normalizePostcode(exactResult.postcode);
        exactResult.isValidatedPostcode = Boolean(expected && actual && expected === actual);
      }
      return exactResult;
    }
  }

  // 2. Fallback to OpenStreetMap Nominatim for general address query (only if exact postcode lookup failed or no postcode found)
  try {
    const query = addressOrPostcode || targetPostcode || "";
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&countrycodes=gb&q=${encodeURIComponent(query)}`);
    if (res.ok) {
      const results = await res.json();
      if (Array.isArray(results) && results.length > 0) {
        return {
          latitude: parseFloat(results[0].lat),
          longitude: parseFloat(results[0].lon),
          matchType: "nominatim",
          isValidatedPostcode: false,
        };
      }
    }
  } catch {
    // Ignore fetch error
  }

  return null;
}

