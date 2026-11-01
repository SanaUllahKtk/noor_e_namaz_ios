// Local Persistence & State Manager
// 100% Offline using browser localStorage
// Robust defaults, migration, and export/import capability

const STORAGE_KEYS = {
  SETTINGS: 'noor_settings_v1',
  PRAYER_LOGS: 'noor_prayer_logs_v1',
  QAZA: 'noor_qaza_state_v1',
  TASBEEH: 'noor_tasbeeh_state_v1',
  BOOKMARK: 'noor_tilawat_bookmark_v1'
};

export const DEFAULT_SETTINGS = {
  location: {
    cityId: 'pk-khi',
    cityName: 'کراچی',
    country: 'Pakistan',
    lat: 24.8607,
    lng: 67.0011,
    timezone: 5,
    isGps: false
  },
  calcMethod: 'Karachi', // 'Karachi', 'MWL', 'UmmAlQura', 'ISNA', 'Egypt'
  asrJuristic: 'Hanafi', // 'Hanafi' or 'Standard' (Shafi)
  is24Hour: false,
  alarms: {
    fajr: { enabled: true, sound: 'takbeer', volume: 0.8 },
    sunrise: { enabled: false, sound: 'chime', volume: 0.5 },
    dhuhr: { enabled: true, sound: 'takbeer', volume: 0.8 },
    asr: { enabled: true, sound: 'takbeer', volume: 0.8 },
    maghrib: { enabled: true, sound: 'takbeer', volume: 0.8 },
    isha: { enabled: true, sound: 'takbeer', volume: 0.8 }
  },
  offsets: {
    fajr: 0,
    sunrise: 0,
    dhuhr: 0,
    asr: 0,
    maghrib: 0,
    isha: 0
  },
  soundEnabled: true,
  vibrationEnabled: true,
  feedbackMode: 'sound', // 'sound', 'vibrate', 'silent'
  adhanVoice: './audio/adhan.mp3', // Direct Adhan without intro
  autoAddToQaza: true // Automatically add missed prayer to Qaza bank
};

export const DEFAULT_QAZA = {
  fajr: 0,
  dhuhr: 0,
  asr: 0,
  maghrib: 0,
  isha: 0,
  witr: 0,
  initialTotal: 0,
  totalPrayedQaza: 0,
  calculatorMeta: {
    ageAtPuberty: 14,
    currentAge: 25,
    missedYears: 0,
    missedMonths: 0
  }
};

export const DEFAULT_TASBEEH = {
  currentCount: 0,
  targetCount: 33,
  lapCount: 0,
  totalLifetimeCount: 0,
  currentDhikr: {
    id: 'subhanallah',
    title: 'سُبْحَانَ اللَّهِ',
    translation: 'اللہ پاک ہے (ہر عیب سے منزہ)'
  }
};

class StorageManager {
  // --- SETTINGS ---
  getSettings() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (!data) return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
      const parsed = JSON.parse(data) || {};
      return {
        ...DEFAULT_SETTINGS,
        ...parsed,
        location: { ...DEFAULT_SETTINGS.location, ...(parsed.location || {}) },
        alarms: { ...DEFAULT_SETTINGS.alarms, ...(parsed.alarms || {}) },
        offsets: { ...DEFAULT_SETTINGS.offsets, ...(parsed.offsets || {}) }
      };
    } catch (e) {
      console.error('Error reading settings:', e);
      return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    }
  }

  saveSettings(settings) {
    try {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    } catch (e) {
      console.error('Error saving settings:', e);
    }
  }

  // --- DAILY PRAYER RECORDS (TICK MARKS) ---
  // Format for dateKey: "YYYY-MM-DD"
  getTodayDateKey() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  getAllPrayerLogs() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.PRAYER_LOGS);
      return data ? JSON.parse(data) : {};
    } catch (e) {
      console.error('Error reading prayer logs:', e);
      return {};
    }
  }

  getDailyLog(dateKey = this.getTodayDateKey()) {
    try {
      const logs = this.getAllPrayerLogs();
      const defaultLog = {
        fajr: 'pending', // 'offered', 'missed', 'pending'
        dhuhr: 'pending',
        asr: 'pending',
        maghrib: 'pending',
        isha: 'pending',
        tahajjud: false,
        ishraq: false,
        date: dateKey
      };
      if (!logs || typeof logs !== 'object') return defaultLog;
      const log = logs[dateKey];
      if (!log || typeof log !== 'object') return defaultLog;
      return { ...defaultLog, ...log };
    } catch (e) {
      return {
        fajr: 'pending',
        dhuhr: 'pending',
        asr: 'pending',
        maghrib: 'pending',
        isha: 'pending',
        tahajjud: false,
        ishraq: false,
        date: dateKey
      };
    }
  }

  updatePrayerStatus(prayerKey, status, dateKey = this.getTodayDateKey()) {
    const logs = this.getAllPrayerLogs();
    if (!logs[dateKey]) {
      logs[dateKey] = this.getDailyLog(dateKey);
    }

    const previousStatus = logs[dateKey][prayerKey];
    logs[dateKey][prayerKey] = status;
    logs[dateKey].updatedAt = new Date().toISOString();

    try {
      localStorage.setItem(STORAGE_KEYS.PRAYER_LOGS, JSON.stringify(logs));
    } catch (e) {
      console.error('Error updating prayer log:', e);
    }

    // Auto-sync with Qaza bank if setting enabled
    const settings = this.getSettings();
    if (settings.autoAddToQaza && prayerKey !== 'tahajjud' && prayerKey !== 'ishraq') {
      if (status === 'missed' && previousStatus !== 'missed') {
        this.incrementQaza(prayerKey, 1);
      } else if (previousStatus === 'missed' && status === 'offered') {
        // If user changed their mind from missed to offered, subtract from qaza
        this.decrementQaza(prayerKey, 1);
      }
    }

    return logs[dateKey];
  }

  // Calculate current streak of prayers (days where 5/5 prayers offered)
  calculateStats() {
    const logs = this.getAllPrayerLogs();
    const keys = Object.keys(logs).sort().reverse();
    let totalOffered = 0;
    let totalMissed = 0;
    let perfectDays = 0;
    let streak = 0;

    let streakBroken = false;
    const today = this.getTodayDateKey();

    keys.forEach((key) => {
      const log = logs[key];
      if (!log || typeof log !== 'object') return;
      const prayers = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
      let dayOffered = 0;
      let dayMissed = 0;

      prayers.forEach((p) => {
        if (log[p] === 'offered') dayOffered++;
        if (log[p] === 'missed') dayMissed++;
      });

      totalOffered += dayOffered;
      totalMissed += dayMissed;

      if (dayOffered === 5) {
        perfectDays++;
        if (!streakBroken) streak++;
      } else if (key !== today) {
        streakBroken = true;
      }
    });

    return { totalOffered, totalMissed, perfectDays, streak };
  }

  // --- QAZA MANAGEMENT ---
  getQazaData() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.QAZA);
      if (!data) return { ...DEFAULT_QAZA };
      return { ...DEFAULT_QAZA, ...JSON.parse(data) };
    } catch (e) {
      console.error('Error reading qaza:', e);
      return { ...DEFAULT_QAZA };
    }
  }

  saveQazaData(qazaData) {
    try {
      localStorage.setItem(STORAGE_KEYS.QAZA, JSON.stringify(qazaData));
    } catch (e) {
      console.error('Error saving qaza:', e);
    }
  }

  incrementQaza(prayerKey, amount = 1) {
    const qaza = this.getQazaData();
    if (qaza[prayerKey] !== undefined) {
      qaza[prayerKey] = Math.max(0, (qaza[prayerKey] || 0) + amount);
      this.saveQazaData(qaza);
    }
    return qaza;
  }

  decrementQaza(prayerKey, amount = 1) {
    const qaza = this.getQazaData();
    if (qaza[prayerKey] !== undefined && qaza[prayerKey] > 0) {
      const actualDeduction = Math.min(qaza[prayerKey], amount);
      qaza[prayerKey] -= actualDeduction;
      qaza.totalPrayedQaza = (qaza.totalPrayedQaza || 0) + actualDeduction;
      this.saveQazaData(qaza);
    }
    return qaza;
  }

  calculateQazaUmri({ ageAtPuberty = 14, currentAge = 25, missedYears = 0, missedMonths = 0 }) {
    let totalDays = 0;
    if (missedYears > 0 || missedMonths > 0) {
      totalDays = Math.round(missedYears * 365.25 + missedMonths * 30.4);
    } else {
      const diffYears = Math.max(0, currentAge - ageAtPuberty);
      totalDays = Math.round(diffYears * 365.25);
    }

    const qaza = this.getQazaData();
    qaza.fajr = totalDays;
    qaza.dhuhr = totalDays;
    qaza.asr = totalDays;
    qaza.maghrib = totalDays;
    qaza.isha = totalDays;
    qaza.witr = totalDays;
    qaza.initialTotal = totalDays * 6;
    qaza.totalPrayedQaza = 0;
    qaza.calculatorMeta = { ageAtPuberty, currentAge, missedYears, missedMonths };

    this.saveQazaData(qaza);
    return qaza;
  }

  // --- TASBEEH ---
  getTasbeehData() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.TASBEEH);
      if (!data) return { ...DEFAULT_TASBEEH };
      return { ...DEFAULT_TASBEEH, ...JSON.parse(data) };
    } catch (e) {
      console.error('Error reading tasbeeh:', e);
      return { ...DEFAULT_TASBEEH };
    }
  }

  saveTasbeehData(tasbeehData) {
    try {
      localStorage.setItem(STORAGE_KEYS.TASBEEH, JSON.stringify(tasbeehData));
    } catch (e) {
      console.error('Error saving tasbeeh:', e);
    }
  }

  // --- TILAWAT BOOKMARK ---
  getBookmark() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.BOOKMARK);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      return null;
    }
  }

  saveBookmark(surahId, verseNumber) {
    try {
      localStorage.setItem(
        STORAGE_KEYS.BOOKMARK,
        JSON.stringify({ surahId, verseNumber, timestamp: new Date().toISOString() })
      );
    } catch (e) {}
  }
}

export const storage = new StorageManager();
