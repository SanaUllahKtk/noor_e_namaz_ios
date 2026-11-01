// Pure Offline Astronomical Prayer Times Calculation Engine
// Based on international mathematical astronomy standards (Meeus algorithm & Muslim World standards)
// No internet or external APIs required!

export const CALC_METHODS = {
  Karachi: {
    name: 'University of Islamic Sciences, Karachi (Hanafi Default)',
    fajrAngle: 18.0,
    ishaAngle: 18.0,
    maghribMinutes: 0
  },
  MWL: {
    name: 'Muslim World League (MWL)',
    fajrAngle: 18.0,
    ishaAngle: 17.0,
    maghribMinutes: 0
  },
  UmmAlQura: {
    name: 'Umm Al-Qura University, Makkah',
    fajrAngle: 18.5,
    ishaInterval: 90, // 90 min after Maghrib (120 min during Ramadan)
    maghribMinutes: 0
  },
  ISNA: {
    name: 'Islamic Society of North America (ISNA)',
    fajrAngle: 15.0,
    ishaAngle: 15.0,
    maghribMinutes: 0
  },
  Egypt: {
    name: 'Egyptian General Authority of Survey',
    fajrAngle: 19.5,
    ishaAngle: 17.5,
    maghribMinutes: 0
  },
  Qatar: {
    name: 'Qatar Standard',
    fajrAngle: 18.0,
    ishaInterval: 90,
    maghribMinutes: 0
  },
  Kuwait: {
    name: 'Kuwait Standard',
    fajrAngle: 18.0,
    ishaAngle: 17.5,
    maghribMinutes: 0
  },
  Turkey: {
    name: 'Diyanet Isleri Baskanligi, Turkey',
    fajrAngle: 18.0,
    ishaAngle: 17.0,
    maghribMinutes: 0
  }
};

// Math helper functions
const d2r = (d) => (d * Math.PI) / 180.0;
const r2d = (r) => (r * 180.0) / Math.PI;
const sinD = (d) => Math.sin(d2r(d));
const cosD = (d) => Math.cos(d2r(d));
const tanD = (d) => Math.tan(d2r(d));
const asinD = (x) => r2d(Math.asin(x));
const acosD = (x) => r2d(Math.acos(x));
const atan2D = (y, x) => r2d(Math.atan2(y, x));

// Julian Date calculation
function getJulianDate(year, month, day) {
  if (month <= 2) {
    year -= 1;
    month += 12;
  }
  const A = Math.floor(year / 100);
  const B = 2 - A + Math.floor(A / 4);
  return (
    Math.floor(365.25 * (year + 4716)) +
    Math.floor(30.6001 * (month + 1)) +
    day +
    B -
    1524.5
  );
}

// Compute sun coordinates: Declination (dec) and Equation of Time (eqt)
function getSunPosition(jd) {
  const D = jd - 2451545.0;
  const g = (357.529 + 0.98560028 * D) % 360;
  const q = (280.459 + 0.98564736 * D) % 360;
  const L = (q + 1.915 * sinD(g) + 0.02 * sinD(2 * g)) % 360;
  const e = 23.439 - 0.00000036 * D;

  const RA = atan2D(cosD(e) * sinD(L), cosD(L)) / 15.0;
  const RA_normalized = (RA + 24) % 24;

  const declination = asinD(sinD(e) * sinD(L));
  const equationOfTime = (q / 15.0) - RA_normalized;
  let eqtMinutes = equationOfTime * 60;
  if (eqtMinutes > 20) eqtMinutes -= 24 * 60;
  if (eqtMinutes < -20) eqtMinutes += 24 * 60;

  return { declination, equationOfTime: eqtMinutes };
}

// Compute hour angle for sun altitude
function computeHourAngle(altitude, lat, declination) {
  const cosH = (sinD(altitude) - sinD(lat) * sinD(declination)) / (cosD(lat) * cosD(declination));
  if (cosH > 1.0) return null; // Sun never rises to this altitude (polar day/night)
  if (cosH < -1.0) return null;
  return acosD(cosH);
}

// Calculate All Prayer Times for a given date and location
export function calculatePrayerTimes({
  date = new Date(),
  latitude = 24.8607,
  longitude = 67.0011,
  timezone = 5,
  methodKey = 'Karachi',
  asrJuristic = 'Hanafi', // 'Hanafi' or 'Standard' (Shafi, Maliki, Hanbali)
  elevation = 15,
  offsets = { fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 }
}) {
  const method = CALC_METHODS[methodKey] || CALC_METHODS.Karachi;

  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();

  const jd = getJulianDate(year, month, day);
  const { declination, equationOfTime } = getSunPosition(jd);

  // Solar noon (Dhuhr)
  const dhuhrBase = 12 + timezone - longitude / 15.0 - equationOfTime / 60.0;

  // Sunrise / Sunset horizon angle (accounting for refraction and sun diameter)
  const sunHorizonAngle = -0.833 - (0.0347 * Math.sqrt(Math.max(0, elevation)));

  // Sunrise and Sunset hour angle
  const sunRiseSetH = computeHourAngle(sunHorizonAngle, latitude, declination);
  const sunriseBase = sunRiseSetH ? dhuhrBase - sunRiseSetH / 15.0 : null;
  const sunsetBase = sunRiseSetH ? dhuhrBase + sunRiseSetH / 15.0 : null;

  // Fajr hour angle (fajrAngle below horizon)
  const fajrH = computeHourAngle(-method.fajrAngle, latitude, declination);
  const fajrBase = fajrH ? dhuhrBase - fajrH / 15.0 : null;

  // Asr altitude
  // Shadow factor: 1 for Shafi/Standard, 2 for Hanafi
  const shadowFactor = asrJuristic === 'Hanafi' ? 2 : 1;
  const asrAlt = r2d(Math.atan(1 / (shadowFactor + Math.tan(Math.abs(d2r(latitude - declination))))));
  const asrH = computeHourAngle(asrAlt, latitude, declination);
  const asrBase = asrH ? dhuhrBase + asrH / 15.0 : null;

  // Maghrib
  const maghribBase = sunsetBase ? sunsetBase + (method.maghribMinutes || 0) / 60.0 : null;

  // Isha
  let ishaBase;
  if (method.ishaInterval) {
    // Fixed minutes after Maghrib (e.g. Umm Al-Qura)
    ishaBase = maghribBase ? maghribBase + method.ishaInterval / 60.0 : null;
  } else {
    const ishaH = computeHourAngle(-method.ishaAngle, latitude, declination);
    ishaBase = ishaH ? dhuhrBase + ishaH / 15.0 : null;
  }

  // Convert decimal hours to Date objects
  const toDateObj = (decimalHours, minuteOffset = 0, fallbackHour = 12, fallbackMinute = 0) => {
    const d = new Date(date);
    if (decimalHours === null || isNaN(decimalHours)) {
      d.setHours(fallbackHour, fallbackMinute, 0, 0);
      return d;
    }
    let totalMinutes = Math.round(decimalHours * 60) + minuteOffset;
    let h = Math.floor(totalMinutes / 60);
    let m = Math.floor(totalMinutes % 60);
    h = (h + 24) % 24;
    d.setHours(h, m, 0, 0);
    return d;
  };

  const times = {
    fajr: toDateObj(fajrBase, offsets.fajr || 0, 5, 15),
    sunrise: toDateObj(sunriseBase, offsets.sunrise || 0, 6, 30),
    dhuhr: toDateObj(dhuhrBase, (offsets.dhuhr || 0) + 1, 12, 30), // 1 min safe buffer past solar zenith
    asr: toDateObj(asrBase, offsets.asr || 0, 16, 0),
    maghrib: toDateObj(maghribBase, (offsets.maghrib || 0) + 1, 18, 15), // 1 min buffer after sunset
    isha: toDateObj(ishaBase, offsets.isha || 0, 19, 45)
  };

  // Additional secondary Islamic times
  // Sehri / Imsak (10 mins before Fajr)
  const sehri = new Date(times.fajr.getTime() - 10 * 60000);
  // Ishraq (15 mins after Sunrise)
  const ishraq = new Date(times.sunrise.getTime() + 15 * 60000);
  // Chasht / Duha (45 mins after Sunrise)
  const chasht = new Date(times.sunrise.getTime() + 45 * 60000);
  // Zawal (10 mins before Dhuhr)
  const zawal = new Date(times.dhuhr.getTime() - 10 * 60000);

  // Tahajjud: Last 3rd of the night between Maghrib and Fajr
  // Calculate night length
  const nextDayFajr = new Date(times.fajr.getTime() + 24 * 3600000);
  const nightDurationMs = Math.max(0, nextDayFajr.getTime() - times.maghrib.getTime());
  const tahajjudStart = new Date(nextDayFajr.getTime() - nightDurationMs / 3);

  return {
    ...times,
    sehri,
    ishraq,
    chasht,
    zawal,
    tahajjud: tahajjudStart
  };
}

// Format Date object to "05:30 AM" or "17:30"
export function formatPrayerTime(dateObj, is24Hour = false) {
  if (!dateObj || !(dateObj instanceof Date) || isNaN(dateObj.getTime())) return '--:--';
  let hours = dateObj.getHours();
  const minutes = dateObj.getMinutes().toString().padStart(2, '0');
  if (is24Hour) {
    return `${hours.toString().padStart(2, '0')}:${minutes}`;
  }
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${hours.toString().padStart(2, '0')}:${minutes} ${ampm}`;
}

// Determine Current Prayer and Next Prayer based on now
export function getPrayerStatus(prayerTimes, currentTime = new Date()) {
  if (!prayerTimes) {
    prayerTimes = calculatePrayerTimes({ date: currentTime });
  }

  const prayers = [
    { key: 'fajr', name: 'Fajr', urduName: 'فجر', time: prayerTimes.fajr },
    { key: 'sunrise', name: 'Sunrise (Tulu)', urduName: 'طلوعِ آفتاب', time: prayerTimes.sunrise, isRestricted: true },
    { key: 'dhuhr', name: 'Dhuhr', urduName: 'ظہر', time: prayerTimes.dhuhr },
    { key: 'asr', name: 'Asr', urduName: 'عصر', time: prayerTimes.asr },
    { key: 'maghrib', name: 'Maghrib', urduName: 'مغرب', time: prayerTimes.maghrib },
    { key: 'isha', name: 'Isha', urduName: 'عشاء', time: prayerTimes.isha }
  ];

  const nowMs = currentTime.getTime();
  let currentPrayer = prayers[prayers.length - 1]; // Default to Isha if after Isha or before Fajr
  let nextPrayer = prayers[0]; // Default next is Fajr

  // Check where now fits
  for (let i = 0; i < prayers.length; i++) {
    const pTime = prayers[i].time ? prayers[i].time.getTime() : 0;
    if (nowMs < pTime) {
      nextPrayer = prayers[i];
      currentPrayer = i === 0 ? prayers[prayers.length - 1] : prayers[i - 1];
      break;
    }
  }

  // Calculate remaining time to next prayer
  let nextTimeMs = nextPrayer && nextPrayer.time ? nextPrayer.time.getTime() : nowMs;
  if (nextTimeMs < nowMs) {
    // Next prayer is tomorrow's Fajr
    nextTimeMs += 24 * 3600000;
  }
  const diffMs = Math.max(0, nextTimeMs - nowMs);
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  const diffSeconds = Math.floor((diffMs % (1000 * 60)) / 1000);

  return {
    current: currentPrayer,
    next: nextPrayer,
    countdown: {
      hours: diffHours,
      minutes: diffMinutes,
      seconds: diffSeconds,
      totalSeconds: Math.floor(diffMs / 1000),
      formatted: `${diffHours.toString().padStart(2, '0')}:${diffMinutes.toString().padStart(2, '0')}:${diffSeconds.toString().padStart(2, '0')}`
    }
  };
}

// Calculate Qibla Direction (Bearing in degrees 0-360 from True North)
export function calculateQiblaDirection(lat, lng) {
  const kaabaLat = 21.422487;
  const kaabaLng = 39.826206;

  const latRad = d2r(lat);
  const lngRad = d2r(lng);
  const kLatRad = d2r(kaabaLat);
  const kLngRad = d2r(kaabaLng);

  const deltaLng = kLngRad - lngRad;
  const y = Math.sin(deltaLng);
  const x = Math.cos(latRad) * Math.tan(kLatRad) - Math.sin(latRad) * Math.cos(deltaLng);

  let qibla = r2d(Math.atan2(y, x));
  return (qibla + 360) % 360;
}

// Calculate Distance to Holy Kaaba in Kilometers (Haversine Formula)
export function calculateKaabaDistanceKm(lat, lng) {
  const kaabaLat = 21.422487;
  const kaabaLng = 39.826206;
  const R = 6371; // Earth radius in km
  const dLat = d2r(kaabaLat - lat);
  const dLng = d2r(kaabaLng - lng);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(d2r(lat)) * Math.cos(d2r(kaabaLat)) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

// Get Urdu description for Compass Bearing
export function getQiblaDirectionName(bearing) {
  const b = (bearing + 360) % 360;
  if (b >= 337.5 || b < 22.5) return 'شمال (North)';
  if (b >= 22.5 && b < 67.5) return 'شمال مشرق (NE)';
  if (b >= 67.5 && b < 112.5) return 'مشرق (East)';
  if (b >= 112.5 && b < 157.5) return 'جنوب مشرق (SE)';
  if (b >= 157.5 && b < 202.5) return 'جنوب (South)';
  if (b >= 202.5 && b < 247.5) return 'جنوب مغرب (SW)';
  if (b >= 247.5 && b < 292.5) return 'مغرب جنوب (WSW)';
  return 'شمال مغرب (NW)';
}
