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

/** Helper to lookup UK postcode or full address via postcodes.io or Nominatim */
export async function lookupUkPostcodeOrAddress(addressOrPostcode: string): Promise<{ latitude: number; longitude: number } | null> {
  if (!addressOrPostcode) return null;

  // Extract UK postcode pattern (e.g. SE18 6JW, DA17 5DB, SE18 7BN)
  const postcodeRegex = /([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})/i;
  const match = addressOrPostcode.match(postcodeRegex);

  if (match) {
    const cleanPostcode = match[1].replace(/\s+/g, "");
    try {
      const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(cleanPostcode)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.status === 200 && data.result) {
          return {
            latitude: data.result.latitude,
            longitude: data.result.longitude,
          };
        }
      }
    } catch {
      // Fall through to nominatim
    }
  }

  // Fallback to OpenStreetMap Nominatim
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&countrycodes=gb&q=${encodeURIComponent(addressOrPostcode)}`);
    if (res.ok) {
      const results = await res.json();
      if (Array.isArray(results) && results.length > 0) {
        return {
          latitude: parseFloat(results[0].lat),
          longitude: parseFloat(results[0].lon),
        };
      }
    }
  } catch {
    // Ignore fetch error
  }

  return null;
}
