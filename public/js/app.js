// NOOR-E-NAMAZ | Master Application Controller
// Built for Technology Tycoons
// 100% Offline, Zero Internet Dependency

import { CITIES_DATABASE, DEFAULT_CITY } from './cities-db.js';
import { calculatePrayerTimes, formatPrayerTime, getPrayerStatus, calculateQiblaDirection, calculateKaabaDistanceKm, getQiblaDirectionName, CALC_METHODS } from './prayer-calc.js';
import { audioEngine } from './audio-synth.js';
import { storage } from './storage.js';
import { QURAN_SURAHS } from './quran-data.js';
import { ALL_SURAHS_INDEX } from './quran-meta.js';
import { WAZAIF_LIST, WAZAIF_CATEGORIES } from './wazaif-data.js';
import { NAMAZ_ESSENTIALS, WUZU_ESSENTIALS, ISLAMIC_HISTORY } from './islamic-knowledge.js';
import { QURAN_WORD_TIMINGS } from './quran-segments.js';

class IslamicApp {
  constructor() {
    this.settings = storage.getSettings();
    this.currentDate = new Date();
    this.prayerTimes = null;
    this.activeTab = 'namaz';
    this.alarmCheckInterval = null;
    this.lastTriggeredAlarmMinute = null;
    this.activeSurah = null;
    this.arabicFontSize = 24;
    this.activeKnowledgeCategory = 'namaz_faraiz';
    this.isContinuousTilawatPlaying = false;
    this.surahSearchQuery = '';
    this.surahFilterCategory = 'all';
    this.loadedSurahsCache = {};
    this.surahSegmentsCache = {};
    this.activeProvinceFilter = 'all';
    this.qiblaOrientationListener = null;

    this.init();
  }

  init() {
    try {
      this.bindEvents();
      this.recalculatePrayers();
      this.renderAllViews();
      this.startLiveTimers();
      this.initPWA();
      this.initNotifications();
      this.updateVoiceLabels();
      this.updateFeedbackModeUI();
    } catch (err) {
      console.error('App initialization error:', err);
    }

    // Smooth Technology Tycoons Splash Screen Animation dismissal
    const dismissSplash = () => {
      if (typeof window.__dismissSplash === 'function') {
        window.__dismissSplash();
      } else {
        const splash = document.getElementById('app-splash-screen');
        if (splash && !splash.classList.contains('fade-out')) {
          splash.classList.add('fade-out');
          setTimeout(() => { try { splash.remove(); } catch (_) {} }, 450);
        }
      }
    };
    setTimeout(dismissSplash, 1800);
    document.getElementById('app-splash-screen')?.addEventListener('click', dismissSplash);

    // Check if first-time user (prompt for location only AFTER splash is completely gone)
    if (!localStorage.getItem('noor_has_configured_location')) {
      setTimeout(() => this.openLocationModal(), 2400);
      localStorage.setItem('noor_has_configured_location', 'true');
    }
  }

  // --- RECALCULATE PRAYERS ---
  recalculatePrayers() {
    try {
      if (!this.settings || !this.settings.location) {
        this.settings = storage.getSettings();
      }
      const loc = this.settings.location || { lat: 24.8607, lng: 67.0011, timezone: 5 };
      const lat = Number(loc.lat) || 24.8607;
      const lng = Number(loc.lng) || 67.0011;
      const tz = (Number(loc.timezone) !== undefined && !isNaN(Number(loc.timezone))) ? Number(loc.timezone) : 5;

      this.prayerTimes = calculatePrayerTimes({
        date: this.currentDate || new Date(),
        latitude: lat,
        longitude: lng,
        timezone: tz,
        methodKey: this.settings.calcMethod || 'Karachi',
        asrJuristic: this.settings.asrJuristic || 'Hanafi',
        offsets: this.settings.offsets || {}
      });
    } catch (err) {
      console.error('calculatePrayerTimes failed, using safe fallback:', err);
      this.prayerTimes = calculatePrayerTimes({
        date: new Date(),
        latitude: 24.8607,
        longitude: 67.0011,
        timezone: 5
      });
    }
  }

  // --- BIND ALL USER INTERACTIONS ---
  bindEvents() {
    // Tab switching
    document.querySelectorAll('.nav-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        if (tab === 'settings') {
          const screen = document.getElementById('screen-settings');
          if (screen && screen.style.display === 'flex') {
            this.closeSettingsScreen();
            return;
          }
          this.closeLocationScreen();
          this.openSettingsScreen();
          return;
        }
        this.switchTab(tab);
      });
    });

    // Top Header & Hero Location Buttons
    document.getElementById('btn-hero-location')?.addEventListener('click', () => this.openLocationModal());
    document.getElementById('btn-header-location')?.addEventListener('click', () => this.openLocationModal());
    document.getElementById('btn-header-knowledge')?.addEventListener('click', () => this.switchTab('knowledge'));
    document.getElementById('btn-quick-launch-knowledge')?.addEventListener('click', () => this.switchTab('knowledge'));
    document.getElementById('btn-header-settings')?.addEventListener('click', () => this.openSettingsModal());
    document.getElementById('btn-header-about')?.addEventListener('click', () => this.openAboutModal());
    document.getElementById('btn-open-qibla-compass')?.addEventListener('click', () => this.openQiblaCompassModal());

    // Settings Modal Links & Prayer Alarms
    document.getElementById('btn-settings-about')?.addEventListener('click', () => {
      this.closeModals();
      this.openAboutModal();
    });

    document.querySelectorAll('.setting-alarm-chk').forEach(chk => {
      chk.addEventListener('change', () => {
        const pKey = chk.dataset.prayer;
        if (!this.settings.alarms) this.settings.alarms = {};
        if (!this.settings.alarms[pKey]) {
          this.settings.alarms[pKey] = { enabled: true, sound: 'takbeer', volume: 0.8 };
        }
        this.settings.alarms[pKey].enabled = chk.checked;
        storage.saveSettings(this.settings);
      });
    });

    // Feedback Mode (Sound / Vibrate / Silent) Buttons
    document.querySelectorAll('.tasbeeh-mode-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.setFeedbackMode(btn.dataset.mode);
      });
    });
    document.getElementById('select-feedback-mode')?.addEventListener('change', (e) => {
      this.setFeedbackMode(e.target.value);
    });

    // Location Modal Search, Clear, Province Tabs, & Popular Chips
    const cityInput = document.getElementById('input-city-search');
    const cityClear = document.getElementById('btn-clear-city-search');
    cityInput?.addEventListener('input', (e) => {
      this.filterCitiesList(e.target.value);
    });
    cityClear?.addEventListener('click', () => {
      if (cityInput) cityInput.value = '';
      this.filterCitiesList('');
      cityInput?.focus();
    });

    document.getElementById('btn-close-location-screen')?.addEventListener('click', () => this.closeLocationScreen());
    document.getElementById('btn-close-settings-screen')?.addEventListener('click', () => this.closeSettingsScreen());

    document.querySelectorAll('.loc-prov-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.loc-prov-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.filterCitiesList('', btn.dataset.province);
      });
    });

    document.querySelectorAll('.loc-quick-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const cityId = chip.dataset.cityId;
        const city = CITIES_DATABASE.find(c => c.id === cityId);
        if (city) this.selectCity(city);
      });
    });

    document.getElementById('btn-use-gps')?.addEventListener('click', () => this.detectGpsLocation());

    // Alarm Modal Actions
    document.getElementById('btn-alarm-dismiss')?.addEventListener('click', () => this.dismissAlarm());
    document.getElementById('btn-alarm-snooze')?.addEventListener('click', () => this.snoozeAlarm());
    document.getElementById('btn-alarm-offered')?.addEventListener('click', () => {
      this.dismissAlarm();
      const status = getPrayerStatus(this.prayerTimes, new Date());
      if (status.current && status.current.key !== 'sunrise') {
        this.markPrayer(status.current.key, 'offered');
      }
    });

    // Tasbeeh Ring Count Touch (Instant Pointerdown & Click with Debounce)
    const tasbeehRing = document.getElementById('tasbeeh-ring');
    if (tasbeehRing) {
      let lastTapTime = 0;
      const onRingTap = (e) => {
        if (e) {
          e.stopPropagation();
        }
        const now = Date.now();
        if (now - lastTapTime < 70) return; // Debounce rapid multi-events
        lastTapTime = now;
        this.incrementTasbeeh();
      };
      tasbeehRing.addEventListener('pointerdown', onRingTap);
      tasbeehRing.addEventListener('click', (e) => {
        const now = Date.now();
        if (now - lastTapTime < 90) return;
        onRingTap(e);
      });
    }
    document.getElementById('btn-tasbeeh-reset')?.addEventListener('click', () => this.resetTasbeeh());
    document.getElementById('btn-reset-lifetime')?.addEventListener('click', () => this.resetLifetimeTasbeeh());
    document.getElementById('btn-settings-reset-lifetime')?.addEventListener('click', () => this.resetLifetimeTasbeeh());
    document.getElementById('select-tasbeeh-preset')?.addEventListener('change', (e) => this.changeTasbeehPreset(e.target.value));
    document.getElementById('select-tasbeeh-target')?.addEventListener('change', (e) => this.changeTasbeehTarget(Number(e.target.value)));

    // Qaza Umri Calculator Trigger
    document.getElementById('btn-open-qaza-calc')?.addEventListener('click', () => this.openQazaCalcModal());
    document.getElementById('btn-save-qaza-calc')?.addEventListener('click', () => this.applyQazaCalculation());

    // Settings Modal Save
    document.getElementById('select-calc-method')?.addEventListener('change', (e) => {
      this.settings.calcMethod = e.target.value;
      storage.saveSettings(this.settings);
      this.recalculatePrayers();
      this.renderNamazView();
    });
    document.getElementById('select-asr-juristic')?.addEventListener('change', (e) => {
      this.settings.asrJuristic = e.target.value;
      storage.saveSettings(this.settings);
      this.recalculatePrayers();
      this.renderNamazView();
    });
    document.getElementById('toggle-24h')?.addEventListener('change', (e) => {
      this.settings.is24Hour = e.target.checked;
      storage.saveSettings(this.settings);
      this.renderNamazView();
    });
    document.getElementById('toggle-auto-qaza')?.addEventListener('change', (e) => {
      this.settings.autoAddToQaza = e.target.checked;
      storage.saveSettings(this.settings);
    });

    // Audio test buttons & voice selection (Dashboard & Settings)
    const toggleAdhanPlayback = () => {
      if (audioEngine.isPlayingAdhan) {
        audioEngine.stopCurrentAudio();
      } else {
        const voiceSrc = this.settings.adhanVoice || './audio/adhan.mp3';
        audioEngine.playTakbeerAdhan(null, voiceSrc);
      }
    };

    // Dashboard Audio Controls
    document.getElementById('btn-dash-test-adhan')?.addEventListener('click', toggleAdhanPlayback);
    document.getElementById('btn-dash-stop-adhan')?.addEventListener('click', () => {
      audioEngine.stopCurrentAudio();
    });

    // Settings Audio Controls
    document.getElementById('btn-test-adhan')?.addEventListener('click', toggleAdhanPlayback);
    document.getElementById('btn-stop-audio')?.addEventListener('click', () => {
      audioEngine.stopCurrentAudio();
    });

    // Settings Notification Bar Test Button
    document.getElementById('btn-test-notification-bar')?.addEventListener('click', async () => {
      await this.requestDeviceNotificationPermission();
      const testTitle = 'نورِ نماز - نوٹیفکیشن الرٹ 🔔';
      const testBody = 'ماشاءاللہ! نماز اور قضاء کے الرٹس آپ کے موبائل کی نوٹیفکیشن بار میں کامیابی سے فعال ہیں۔';
      await this.dispatchDeviceNotification(testTitle, testBody, 9999);
      audioEngine.playSoftChime();
      audioEngine.vibrate([60, 40, 100]);
      this.showToast('🔔 موبائل نوٹیفکیشن بار میں نوٹیفکیشن بھیج دیا گیا ہے!');
    });

    document.getElementById('select-adhan-voice')?.addEventListener('change', (e) => {
      this.settings.adhanVoice = e.target.value;
      storage.saveSettings(this.settings);
      this.updateVoiceLabels();
    this.updateFeedbackModeUI();
      if (audioEngine.isPlayingAdhan) {
        audioEngine.playTakbeerAdhan(null, this.settings.adhanVoice);
      }
    });

    // Floating Adhan Banner Stop Action
    document.getElementById('btn-floating-stop-adhan')?.addEventListener('click', (e) => {
      e.stopPropagation();
      audioEngine.stopCurrentAudio();
    });
    document.getElementById('adhan-playing-banner')?.addEventListener('click', () => {
      audioEngine.stopCurrentAudio();
    });

    // Synchronize playback state across entire application
    audioEngine.onPlaybackChange((isPlaying) => {
      this.updateAudioUiState(isPlaying);
    });

    audioEngine.onTilawatStateChange((state) => {
      if (!state || !state.isPlaying) {
        this.clearVerseHighlights();
      }
    });

    // Modal Close buttons
    document.querySelectorAll('[data-close-modal]').forEach((el) => {
      el.addEventListener('click', (e) => {
        audioEngine.stopCurrentAudio();
        const modal = el.closest('.modal-overlay');
        if (modal) {
          modal.classList.remove('active');
          modal.style.display = 'none';
        }
        if (this.qiblaOrientationListener) {
          this.closeQiblaCompassModal();
        }
      });
    });

    document.querySelectorAll('.modal-overlay').forEach((overlay) => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          audioEngine.stopCurrentAudio();
          overlay.classList.remove('active');
          overlay.style.display = 'none';
          if (this.qiblaOrientationListener) {
            this.closeQiblaCompassModal();
          }
        }
      });
    });

    // Quran Font Adjusters
    document.getElementById('btn-quran-font-inc')?.addEventListener('click', () => {
      this.arabicFontSize = Math.min(38, this.arabicFontSize + 2);
      this.applyQuranFontSize();
    });
    document.getElementById('btn-quran-font-dec')?.addEventListener('click', () => {
      this.arabicFontSize = Math.max(18, this.arabicFontSize - 2);
      this.applyQuranFontSize();
    });
    document.getElementById('btn-back-to-surahs')?.addEventListener('click', () => {
      this.stopTilawatPlayback();
      document.getElementById('surah-reader-view').style.display = 'none';
      document.getElementById('surah-list-view').style.display = 'block';
    });

    // Surah Search & Category Filter Pills
    document.getElementById('input-surah-search')?.addEventListener('input', (e) => {
      this.surahSearchQuery = e.target.value.trim().toLowerCase();
      this.renderTilawatView();
    });

    document.getElementById('surah-filter-pills')?.addEventListener('click', (e) => {
      const pill = e.target.closest('.surah-filter-pill');
      if (pill) {
        document.querySelectorAll('.surah-filter-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        this.surahFilterCategory = pill.dataset.filter || 'all';
        this.renderTilawatView();
      }
    });

    // Wazaif Category Tabs
    document.getElementById('wazaif-categories')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.wazaif-cat-btn');
      if (btn) {
        document.querySelectorAll('.wazaif-cat-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.renderWazaifList(btn.dataset.category);
      }
    });

    // Islamic Knowledge Category Tabs
    document.getElementById('knowledge-categories-nav')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.knowledge-pill-btn');
      if (btn) {
        document.querySelectorAll('.knowledge-pill-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.activeKnowledgeCategory = btn.dataset.category;
        this.renderKnowledgeView(btn.dataset.category);
      }
    });

    // Audio context unlock on first interaction
    document.addEventListener('touchstart', () => audioEngine.initContext(), { once: true });
    document.addEventListener('click', () => audioEngine.initContext(), { once: true });

    // Lock-Screen Media Controls (MediaSession API for background Tilawat playback)
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.setActionHandler('play', () => {
          if (this.activeSurah) {
            this.playSurahFromVerse(this.activeSurah, this.currentRecitingAyahIndex || 0);
          }
        });
        navigator.mediaSession.setActionHandler('pause', () => {
          this.stopTilawatPlayback();
        });
        navigator.mediaSession.setActionHandler('nexttrack', () => {
          if (this.activeSurah && this.currentRecitingAyahIndex < this.activeSurah.verses.length - 1) {
            this.playSurahFromVerse(this.activeSurah, this.currentRecitingAyahIndex + 1);
          }
        });
        navigator.mediaSession.setActionHandler('previoustrack', () => {
          if (this.activeSurah && this.currentRecitingAyahIndex > 0) {
            this.playSurahFromVerse(this.activeSurah, this.currentRecitingAyahIndex - 1);
          }
        });
      } catch (_) {}
    }

    // When screen turns back ON after being locked: sync scrolling immediately to current reciting verse
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.isContinuousTilawatPlaying && this.activeSurah) {
        const curVerse = this.activeSurah.verses[this.currentRecitingAyahIndex];
        if (curVerse) {
          const vBox = document.getElementById(`verse-box-${curVerse.number}`);
          if (vBox) {
            vBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
      }
    });

    window.addEventListener('focus', () => {
      if (this.isContinuousTilawatPlaying && this.activeSurah) {
        const curVerse = this.activeSurah.verses[this.currentRecitingAyahIndex];
        if (curVerse) {
          const vBox = document.getElementById(`verse-box-${curVerse.number}`);
          if (vBox) {
            vBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
      }
    });
  }

  // --- TAB SWITCHING ---
  switchTab(tabId) {
    this.activeTab = tabId;

    // Automatically close full-screen location or settings pages if open
    const locScreen = document.getElementById('screen-location');
    if (locScreen) locScreen.style.display = 'none';
    const setScreen = document.getElementById('screen-settings');
    if (setScreen) setScreen.style.display = 'none';
    this.closeModals();

    // Update bottom nav buttons
    document.querySelectorAll('.nav-item').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });

    // Update views
    document.querySelectorAll('.tab-view').forEach((view) => {
      view.classList.toggle('active', view.id === `view-${tabId}`);
    });

    if (tabId !== 'tilawat') {
      this.stopTilawatPlayback();
    }

    // Re-render target view if necessary
    if (tabId === 'tracker') this.renderTrackerView();
    if (tabId === 'qaza') this.renderQazaView();
    if (tabId === 'tilawat') this.renderTilawatView();
    if (tabId === 'tasbeeh') this.renderTasbeehView();
    if (tabId === 'knowledge') this.renderKnowledgeView(this.activeKnowledgeCategory);
    if (tabId === 'namaz') this.renderNamazView();
  }

  // --- RENDER ALL VIEWS ---
  renderAllViews() {
    this.renderHeader();
    this.renderNamazView();
    this.renderTrackerView();
    this.renderQazaView();
    this.renderTilawatView();
    this.renderTasbeehView();
    this.renderKnowledgeView(this.activeKnowledgeCategory);
  }

  // --- HEADER & LOCATION RENDERING ---
  renderHeader() {
    const loc = this.settings.location;
    let locName = loc.isGps ? 'GPS لوکیشن' : (loc.cityName || 'کراچی');
    if (!loc.isGps && loc.cityId) {
      const match = CITIES_DATABASE.find(c => c.id === loc.cityId);
      if (match && match.urdu) {
        locName = match.urdu;
      }
    }

    // Timezone offset format e.g. (PKT +5) or (UTC+5)
    const tzNum = Number(loc.timezone) !== undefined && !isNaN(Number(loc.timezone)) ? Number(loc.timezone) : 5;
    const tzSign = tzNum >= 0 ? '+' : '';
    const tzCode = loc.country === 'Pakistan' ? `PKT +${tzNum}` : `UTC${tzSign}${tzNum}`;

    const heroLoc = document.getElementById('hero-location-name');
    if (heroLoc) heroLoc.textContent = locName;

    const heroTz = document.getElementById('hero-timezone-badge');
    if (heroTz) heroTz.textContent = `(${tzCode})`;

    // Islamic Hijri Date estimation (offline)
    const hijriText = this.getApproximateHijriDate(this.currentDate);
    const heroDate = document.getElementById('hero-islamic-date');
    if (heroDate) heroDate.textContent = hijriText;

    // Fallbacks if header elements exist
    const el = document.getElementById('header-location-name');
    if (el) el.textContent = `${locName} (${tzCode})`;
    const dateEl = document.getElementById('header-islamic-date');
    if (dateEl) dateEl.textContent = hijriText;
  }

  getApproximateHijriDate(date) {
    // Uses Intl with Islamic calendar (available offline in all modern browsers)
    try {
      const formatter = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
      return formatter.format(date);
    } catch (_) {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
  }

  // --- NAMAZ VIEW RENDERING ---
  getQazaTime(prayerKey) {
    if (!this.prayerTimes) return null;
    switch (prayerKey) {
      case 'fajr':
        return { time: this.prayerTimes.sunrise, labelUrdu: 'طلوعِ آفتاب', note: 'طلوعِ آفتاب پر فجر کا وقت ختم' };
      case 'dhuhr':
        return { time: this.prayerTimes.asr, labelUrdu: 'شروعِ عصر', note: 'عصر سے پہلے ادا فرمائیں' };
      case 'asr':
        return { time: this.prayerTimes.maghrib, labelUrdu: 'غروبِ آفتاب', note: 'غروبِ آفتاب پر عصر قضاء' };
      case 'maghrib':
        return { time: this.prayerTimes.isha, labelUrdu: 'شروعِ عشاء', note: 'عشاء سے پہلے ادا فرمائیں' };
      case 'isha': {
        const nextDayFajr = new Date(this.prayerTimes.fajr.getTime() + 24 * 3600000);
        return { time: nextDayFajr, labelUrdu: 'صبحِ صادق', note: 'صبحِ صادق تک وقت ہے' };
      }
      default:
        return null;
    }
  }

  renderNamazView() {
    try {
      if (!this.prayerTimes) {
        this.recalculatePrayers();
      }
      if (!this.prayerTimes) return;

      const now = new Date();
      const status = getPrayerStatus(this.prayerTimes, now);
      const is24h = !!this.settings.is24Hour;

      // Compact Smart Prayer Capsule
      const currentNameEl = document.getElementById('hero-current-name');
      const nextNameEl = document.getElementById('hero-next-name');
      const heroTimeEl = document.getElementById('hero-current-time');
      const countdownEl = document.getElementById('hero-countdown-time');
      const heroQazaEl = document.getElementById('hero-current-qaza-label');

      if (currentNameEl && status.current) currentNameEl.textContent = `${status.current.urduName || ''} کا وقت`;
      if (nextNameEl && status.next) nextNameEl.textContent = `اگلی: ${status.next.urduName || ''} ${formatPrayerTime(status.next.time, is24h)}`;
      if (heroTimeEl && status.current) heroTimeEl.textContent = formatPrayerTime(status.current.time, is24h);
      if (countdownEl && status.countdown) countdownEl.textContent = status.countdown.formatted;

      if (heroQazaEl && status.current) {
        const qazaInfo = this.getQazaTime(status.current.key);
        if (qazaInfo) {
          heroQazaEl.textContent = `قضاء وقت: ${formatPrayerTime(qazaInfo.time, is24h)} (${qazaInfo.labelUrdu})`;
        } else {
          heroQazaEl.textContent = `طلوعِ آفتاب (ممنوع وقت)`;
        }
      }

      // 5 Daily Prayers List with Start and Qaza Times + Quick Action Button
      const prayers = [
        { key: 'fajr', en: 'Fajr', ur: 'فجر', time: this.prayerTimes.fajr, qaza: this.prayerTimes.sunrise, qazaLabel: 'طلوعِ آفتاب', icon: '🌅' },
        { key: 'sunrise', en: 'Sunrise (Tulu)', ur: 'طلوعِ آفتاب', time: this.prayerTimes.sunrise, icon: '☀️', isSunrise: true },
        { key: 'dhuhr', en: 'Dhuhr', ur: 'ظہر', time: this.prayerTimes.dhuhr, qaza: this.prayerTimes.asr, qazaLabel: 'شروعِ عصر', icon: '🌞' },
        { key: 'asr', en: 'Asr', ur: 'عصر', time: this.prayerTimes.asr, qaza: this.prayerTimes.maghrib, qazaLabel: 'غروبِ آفتاب', icon: '⛅' },
        { key: 'maghrib', en: 'Maghrib', ur: 'مغرب', time: this.prayerTimes.maghrib, qaza: this.prayerTimes.isha, qazaLabel: 'شروعِ عشاء', icon: '🌇' },
        { key: 'isha', en: 'Isha', ur: 'عشاء', time: this.prayerTimes.isha, qaza: new Date(this.prayerTimes.fajr.getTime() + 24 * 3600000), qazaLabel: 'صبحِ صادق', icon: '🌙' }
      ];

      const todayKey = storage.getTodayDateKey();
      const todayLog = storage.getDailyLog(todayKey) || {};

      const listContainer = document.getElementById('prayers-list');
      if (listContainer) {
        listContainer.innerHTML = '';

        prayers.forEach((p) => {
          const isCurrent = status.current && status.current.key === p.key;
          const isNext = status.next && status.next.key === p.key;
          const isOffered = todayLog && todayLog[p.key] === 'offered';

          let isUrgentQaza = false;
          let minutesLeft = 0;
          if (p.qaza && isCurrent && !isOffered) {
            minutesLeft = Math.floor((p.qaza.getTime() - now.getTime()) / 60000);
            if (minutesLeft > 0 && minutesLeft <= 30) {
              isUrgentQaza = true;
            }
          }

          const row = document.createElement('div');
          row.className = `prayer-row ${isCurrent ? 'current' : ''} ${isNext ? 'next' : ''} ${isUrgentQaza ? 'qaza-urgent' : ''}`;
          row.setAttribute('dir', 'rtl');

          row.innerHTML = `
            <div class="prayer-lead-group">
              ${!p.isSunrise ? `
              <button class="prayer-tick-btn ${isOffered ? 'offered' : ''}" data-prayer="${p.key}" title="${isOffered ? 'نماز ادا ہو چکی ہے' : 'ادا کی؟ نشان لگائیں'}">
                ${isOffered ? '✓' : ''}
              </button>` : `<span class="prayer-tick-placeholder"></span>`}
              <span class="prayer-row-icon">${p.icon}</span>
              <div class="prayer-name-wrap">
                <span class="prayer-row-name">${p.ur}</span>
                ${isCurrent ? '<span class="prayer-chip-current">جاری</span>' : ''}
                ${isUrgentQaza ? `<span class="prayer-chip-urgent">⚠️ قضاء قریب</span>` : ''}
              </div>
            </div>
            <div class="prayer-time-group" dir="ltr">
              <div class="prayer-row-time">${formatPrayerTime(p.time, is24h)}</div>
              <div class="prayer-row-qaza" dir="rtl">
                ${!p.isSunrise ? `قضاء: ${formatPrayerTime(p.qaza, is24h)}` : `طلوع: ${formatPrayerTime(p.time, is24h)}`}
              </div>
            </div>
          `;

          listContainer.appendChild(row);
        });

        // Bind minimalist tick buttons
        listContainer.querySelectorAll('.prayer-tick-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const pKey = btn.dataset.prayer;
            const currentLog = storage.getDailyLog();
            const newStatus = (currentLog && currentLog[pKey] === 'offered') ? 'pending' : 'offered';
            storage.updatePrayerStatus(pKey, newStatus);
            if (newStatus === 'offered') {
              audioEngine.playMilestoneCelebration();
              audioEngine.vibrate([40, 30, 80]);
            } else {
              audioEngine.playTasbeehClick();
            }
            this.renderNamazView();
            this.renderTrackerView();
            this.checkQazaReminders();
          });
        });
      }

      // Additional timings (Tahajjud, Sehri, Ishraq)
      const extraContainer = document.getElementById('prayers-extra-times');
      if (extraContainer) {
        extraContainer.innerHTML = `
          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; text-align: center; margin-top: 8px;">
            <div style="background: rgba(255,255,255,0.03); padding: 8px 6px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05);">
              <div style="font-size: 10px; color: #94a3b8;">سحری اختتام</div>
              <div style="font-weight: 700; color: #34d399; font-size: 13px;">${formatPrayerTime(this.prayerTimes.sehri, is24h)}</div>
            </div>
            <div style="background: rgba(255,255,255,0.03); padding: 8px 6px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05);">
              <div style="font-size: 10px; color: #94a3b8;">اشراق وقت</div>
              <div style="font-weight: 700; color: #fbbf24; font-size: 13px;">${formatPrayerTime(this.prayerTimes.ishraq, is24h)}</div>
            </div>
            <div style="background: rgba(255,255,255,0.03); padding: 8px 6px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05);">
              <div style="font-size: 10px; color: #94a3b8;">تہجد وقت</div>
              <div style="font-weight: 700; color: #60a5fa; font-size: 13px;">${formatPrayerTime(this.prayerTimes.tahajjud, is24h)}</div>
            </div>
          </div>
        `;
      }

      // Render Qibla Compass Angle
      this.renderQiblaInfo();

      // Check Qaza Reminders for active prayer
      this.checkQazaReminders();
    } catch (err) {
      console.error('Error in renderNamazView:', err);
    }
  }

  // --- AUTOMATED QAZA REMINDER SYSTEM ---
  checkQazaReminders() {
    if (!this.prayerTimes) return;
    const now = new Date();
    const todayKey = storage.getTodayDateKey();
    const todayLog = storage.getDailyLog(todayKey);

    const prayers = [
      { key: 'fajr', ur: 'فجر', start: this.prayerTimes.fajr, qaza: this.prayerTimes.sunrise, qazaLabel: 'طلوعِ آفتاب' },
      { key: 'dhuhr', ur: 'ظہر', start: this.prayerTimes.dhuhr, qaza: this.prayerTimes.asr, qazaLabel: 'شروعِ عصر' },
      { key: 'asr', ur: 'عصر', start: this.prayerTimes.asr, qaza: this.prayerTimes.maghrib, qazaLabel: 'غروبِ آفتاب' },
      { key: 'maghrib', ur: 'مغرب', start: this.prayerTimes.maghrib, qaza: this.prayerTimes.isha, qazaLabel: 'شروعِ عشاء' },
      { key: 'isha', ur: 'عشاء', start: this.prayerTimes.isha, qaza: new Date(this.prayerTimes.fajr.getTime() + 24 * 3600000), qazaLabel: 'صبحِ صادق' }
    ];

    const nowMs = now.getTime();
    let activePrayer = null;

    for (const p of prayers) {
      if (nowMs >= p.start.getTime() && nowMs < p.qaza.getTime()) {
        activePrayer = p;
        break;
      }
    }

    if (!activePrayer) {
      this.hideQazaReminderBanner();
      return;
    }

    // Check if user has offered it
    if (todayLog && todayLog[activePrayer.key] === 'offered') {
      this.hideQazaReminderBanner();
      return;
    }

    // Minutes remaining until Qaza
    const diffMs = activePrayer.qaza.getTime() - nowMs;
    const diffMins = Math.floor(diffMs / 60000);

    // Check snooze
    const snoozeKey = `noor_snooze_qaza_${activePrayer.key}_${todayKey}`;
    const snoozedUntil = parseInt(sessionStorage.getItem(snoozeKey) || '0', 10);
    if (nowMs < snoozedUntil) {
      return;
    }

    // Trigger reminder if 30 minutes or less remain before Qaza
    if (diffMins <= 30 && diffMins > 0) {
      this.showQazaReminderBanner(activePrayer, diffMins);

      // Trigger Web/Mobile Push Notification once per prayer session
      const notifiedKey = `noor_notified_qaza_${activePrayer.key}_${todayKey}`;
      if (!sessionStorage.getItem(notifiedKey)) {
        sessionStorage.setItem(notifiedKey, 'true');
        this.sendNativeQazaNotification(activePrayer, diffMins);
      }
    } else {
      this.hideQazaReminderBanner();
    }
  }

  showQazaReminderBanner(prayer, diffMins) {
    const banner = document.getElementById('qaza-reminder-alert');
    if (!banner) return;

    const titleEl = document.getElementById('qaza-alert-title');
    const descEl = document.getElementById('qaza-alert-desc');
    const btnDone = document.getElementById('btn-qaza-alert-mark');
    const btnClose = document.getElementById('btn-qaza-alert-dismiss');

    if (titleEl) titleEl.textContent = `⚠️ نمازِ ${prayer.ur} کا وقت ختم ہونے کے قریب ہے!`;
    if (descEl) descEl.textContent = `${prayer.ur} کی نماز قضاء ہونے میں صرف ${diffMins} منٹ باقی ہیں (${prayer.qazaLabel})۔ اگر ابھی تک ادا نہیں کی تو فوراً ادا فرما لیں۔`;

    if (btnDone) {
      btnDone.onclick = (e) => {
        e.stopPropagation();
        storage.updatePrayerStatus(prayer.key, 'offered');
        audioEngine.playMilestoneCelebration();
        audioEngine.vibrate([40, 30, 80]);
        this.hideQazaReminderBanner();
        this.renderNamazView();
        this.renderTrackerView();
      };
    }

    if (btnClose) {
      btnClose.onclick = (e) => {
        e.stopPropagation();
        const todayKey = storage.getTodayDateKey();
        const snoozeKey = `noor_snooze_qaza_${prayer.key}_${todayKey}`;
        sessionStorage.setItem(snoozeKey, String(Date.now() + 10 * 60000)); // Snooze 10 minutes
        this.hideQazaReminderBanner();
      };
    }

    banner.style.display = 'block';
  }

  hideQazaReminderBanner() {
    const banner = document.getElementById('qaza-reminder-alert');
    if (banner) banner.style.display = 'none';
  }

  sendNativeQazaNotification(prayer, diffMins) {
    const title = `⚠️ نمازِ ${prayer.ur} کا وقت ختم ہونے کے قریب ہے!`;
    const body = `${prayer.ur} کی نماز قضاء ہونے میں صرف ${diffMins} منٹ باقی ہیں (${prayer.qazaLabel})۔ اگر ابھی تک ادا نہیں کی تو فوراً ادا فرما لیں۔`;
    this.dispatchDeviceNotification(title, body, 7001);
    audioEngine.playSoftChime();
    audioEngine.vibrate([100, 50, 150]);
  }

  // --- QIBLA DIRECTION RENDERING ---
  renderQiblaInfo() {
    const loc = this.settings.location;
    const bearing = calculateQiblaDirection(loc.lat, loc.lng);
    const rounded = Math.round(bearing);
    const distanceKm = calculateKaabaDistanceKm(loc.lat, loc.lng);
    const dirText = getQiblaDirectionName(rounded);

    // Dashboard card elements
    const qiblaDegEl = document.getElementById('qibla-degree-val');
    const qiblaDistEl = document.getElementById('qibla-dist-val');
    const qiblaPointer = document.getElementById('qibla-compass-pointer');

    if (qiblaDegEl) qiblaDegEl.textContent = `${rounded}° (${dirText.split(' ')[0]})`;
    if (qiblaDistEl) qiblaDistEl.textContent = `${distanceKm.toLocaleString()} کلومیٹر`;
    if (qiblaPointer) qiblaPointer.style.transform = `rotate(${rounded}deg)`;

    // Popup Modal elements (if open or rendered)
    const modalCity = document.getElementById('qibla-modal-city-name');
    const modalDeg = document.getElementById('qibla-modal-degree-val');
    const modalDir = document.getElementById('qibla-modal-dir-text');
    const modalDist = document.getElementById('qibla-modal-dist-text');
    const modalNeedle = document.getElementById('qibla-needle-layer');

    if (modalCity) modalCity.textContent = loc.cityUr || loc.city || 'کراچی';
    if (modalDeg) modalDeg.textContent = `${rounded}°`;
    if (modalDir) modalDir.textContent = dirText;
    if (modalDist) modalDist.textContent = `${distanceKm.toLocaleString()} کلومیٹر`;
    if (modalNeedle && !this.qiblaOrientationListener) {
      modalNeedle.style.transform = `rotate(${rounded}deg)`;
    }
  }

  // Open Full Interactive Qibla Compass Popup Modal
  openQiblaCompassModal() {
    const modal = document.getElementById('modal-qibla-compass');
    if (!modal) return;
    this.renderQiblaInfo();
    modal.classList.add('active');
    modal.style.display = 'flex';

    const loc = this.settings.location;
    const bearing = calculateQiblaDirection(loc.lat, loc.lng);
    const needle = document.getElementById('qibla-needle-layer');
    const statusNote = document.getElementById('qibla-compass-sensor-note');

    // Initial smooth turn to the calculated Qibla angle
    if (needle) {
      needle.style.transform = `rotate(${Math.round(bearing)}deg)`;
    }

    // Attach real-time device orientation sensor if supported by hardware
    if (window.DeviceOrientationEvent) {
      this.qiblaOrientationListener = (e) => {
        let heading = null;
        if (typeof e.webkitCompassHeading === 'number') {
          // iOS Safari
          heading = e.webkitCompassHeading;
        } else if (e.alpha !== null) {
          // Android Chrome / Capacitor WebView
          heading = 360 - e.alpha;
        }

        if (heading !== null && !isNaN(heading)) {
          const needleAngle = (bearing - heading + 360) % 360;
          if (needle) needle.style.transform = `rotate(${Math.round(needleAngle)}deg)`;
          if (statusNote) {
            statusNote.textContent = `🧭 لائیو کمپاس سینسر فعال ہے (${Math.round(heading)}° شمال سے)`;
          }
        }
      };

      window.addEventListener('deviceorientationabsolute', this.qiblaOrientationListener, true);
      window.addEventListener('deviceorientation', this.qiblaOrientationListener, true);
    }

    audioEngine.playSoftChime();
  }

  // Close Qibla Compass Popup Modal & Clean Up Orientation Sensors
  closeQiblaCompassModal() {
    const modal = document.getElementById('modal-qibla-compass');
    if (modal) {
      modal.classList.remove('active');
      modal.style.display = 'none';
    }

    if (this.qiblaOrientationListener) {
      window.removeEventListener('deviceorientationabsolute', this.qiblaOrientationListener, true);
      window.removeEventListener('deviceorientation', this.qiblaOrientationListener, true);
      this.qiblaOrientationListener = null;
    }
  }

  // --- ALARM TOGGLE ---
  togglePrayerAlarm(prayerKey) {
    if (!this.settings.alarms) this.settings.alarms = {};
    if (!this.settings.alarms[prayerKey]) {
      this.settings.alarms[prayerKey] = { enabled: true, sound: 'takbeer', volume: 0.8 };
    } else {
      this.settings.alarms[prayerKey].enabled = !this.settings.alarms[prayerKey].enabled;
    }
    storage.saveSettings(this.settings);
    this.renderNamazView();

    // Soft feedback
    audioEngine.playTasbeehClick();
  }

  // --- TRACKER VIEW RENDERING (DAILY RECORD & TICK MARKS) ---
  renderTrackerView() {
    const todayKey = storage.getTodayDateKey();
    const todayLog = storage.getDailyLog(todayKey);
    const stats = storage.calculateStats();

    // Stats bar
    const streakEl = document.getElementById('tracker-streak-count');
    const offeredEl = document.getElementById('tracker-offered-count');
    const missedEl = document.getElementById('tracker-missed-count');

    if (streakEl) streakEl.textContent = `${stats.streak} Days`;
    if (offeredEl) offeredEl.textContent = stats.totalOffered;
    if (missedEl) missedEl.textContent = stats.totalMissed;

    // Daily progress bar (e.g. 4/5 prayers offered)
    const dailyPrayers = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
    const todayOfferedCount = dailyPrayers.filter(p => todayLog[p] === 'offered').length;
    const todayProgressPct = Math.round((todayOfferedCount / 5) * 100);

    const progressFill = document.getElementById('daily-tracker-progress-fill');
    const progressLabel = document.getElementById('daily-tracker-progress-label');
    if (progressFill) progressFill.style.width = `${todayProgressPct}%`;
    if (progressLabel) progressLabel.textContent = `${todayOfferedCount}/5 نمازیں مکمل (${todayProgressPct}%)`;

    // Prayers checklist
    const list = document.getElementById('tracker-checklist');
    if (!list) return;
    list.innerHTML = '';

    const prayerConfig = [
      { key: 'fajr', name: 'Fajr', ur: 'فجر', rakats: '4 رکعت (2 سنت + 2 فرض)' },
      { key: 'dhuhr', name: 'Dhuhr', ur: 'ظہر', rakats: '12 رکعت (4 سنت + 4 فرض + 2 سنت + 2 نفل)' },
      { key: 'asr', name: 'Asr', ur: 'عصر', rakats: '8 رکعت (4 سنت + 4 فرض)' },
      { key: 'maghrib', name: 'Maghrib', ur: 'مغرب', rakats: '7 رکعت (3 فرض + 2 سنت + 2 نفل)' },
      { key: 'isha', name: 'Isha', ur: 'عشاء', rakats: '17 رکعت (4 سنت + 4 فرض + 2 سنت + 2 نفل + 3 وتر + 2 نفل)' }
    ];

    prayerConfig.forEach((p) => {
      const status = todayLog[p.key] || 'pending';
      const row = document.createElement('div');
      row.className = 'tracker-row';

      row.innerHTML = `
        <div>
          <div style="font-weight: 700; font-size: 15px;">
            ${p.name} <span style="font-family: var(--font-urdu); font-size: 14px; color: #34d399; margin-left: 4px;">${p.ur}</span>
          </div>
          <div style="font-size: 11px; color: #94a3b8;">${p.rakats}</div>
        </div>
        <div class="tracker-btns">
          <button class="btn-tick offered ${status === 'offered' ? 'active' : ''}" data-prayer="${p.key}" data-status="offered">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            ادا کی
          </button>
          <button class="btn-tick missed ${status === 'missed' ? 'active' : ''}" data-prayer="${p.key}" data-status="missed">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
            قضا ہوئی
          </button>
        </div>
      `;

      list.appendChild(row);
    });

    // Bind tick buttons
    list.querySelectorAll('.btn-tick').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pKey = btn.dataset.prayer;
        const targetStatus = btn.dataset.status;
        const currentVal = todayLog[pKey];

        // If clicking same status again, toggle back to 'pending'
        const newStatus = currentVal === targetStatus ? 'pending' : targetStatus;
        this.markPrayer(pKey, newStatus);
      });
    });
  }

  markPrayer(prayerKey, status) {
    storage.updatePrayerStatus(prayerKey, status);
    if (status === 'offered') {
      audioEngine.playMilestoneCelebration();
      audioEngine.vibrateMilestone();
    } else {
      audioEngine.playTasbeehClick();
    }
    this.renderTrackerView();
    this.renderQazaView();
  }

  // --- QAZA VIEW RENDERING (QAZA MANAGEMENT & CALCULATOR) ---
  renderQazaView() {
    const qaza = storage.getQazaData();
    const prayers = [
      { key: 'fajr', en: 'Fajr', ur: 'فجر', count: qaza.fajr || 0 },
      { key: 'dhuhr', en: 'Dhuhr', ur: 'ظہر', count: qaza.dhuhr || 0 },
      { key: 'asr', en: 'Asr', ur: 'عصر', count: qaza.asr || 0 },
      { key: 'maghrib', en: 'Maghrib', ur: 'مغرب', count: qaza.maghrib || 0 },
      { key: 'isha', en: 'Isha', ur: 'عشاء', count: qaza.isha || 0 },
      { key: 'witr', en: 'Witr (Wajib)', ur: 'وتر واجب', count: qaza.witr || 0 }
    ];

    const totalRemaining = prayers.reduce((acc, p) => acc + p.count, 0);
    const totalOffered = qaza.totalPrayedQaza || 0;
    const initialTotal = qaza.initialTotal || (totalRemaining + totalOffered);

    const totalEl = document.getElementById('qaza-total-remaining');
    const offeredEl = document.getElementById('qaza-total-offered');
    if (totalEl) totalEl.textContent = totalRemaining.toLocaleString();
    if (offeredEl) offeredEl.textContent = totalOffered.toLocaleString();

    // Progress percentage
    let pct = 0;
    if (initialTotal > 0) {
      pct = Math.min(100, Math.round((totalOffered / (initialTotal || 1)) * 100));
    }
    const barFill = document.getElementById('qaza-progress-fill');
    const barText = document.getElementById('qaza-progress-text');
    if (barFill) barFill.style.width = `${pct}%`;
    if (barText) barText.textContent = `${pct}% قضا نمازیں ادا ہو چکی ہیں`;

    // Qaza Grid
    const grid = document.getElementById('qaza-cards-grid');
    if (!grid) return;
    grid.innerHTML = '';

    prayers.forEach((p) => {
      const card = document.createElement('div');
      card.className = 'qaza-card';
      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-weight: 700; font-size: 14px;">${p.en}</span>
          <span style="font-family: var(--font-urdu); font-size: 13px; color: #34d399;">${p.ur}</span>
        </div>
        <div class="qaza-count">${p.count}</div>
        <div class="qaza-actions">
          <button class="btn-qaza-minus" data-prayer="${p.key}" title="ایک قضا ادا کر لی">
            ✓ ادا کی (-1)
          </button>
          <button class="btn-qaza-plus" data-prayer="${p.key}" title="قضا میں ایک اضافہ کریں">
            +
          </button>
        </div>
      `;

      grid.appendChild(card);
    });

    // Bind action buttons
    grid.querySelectorAll('.btn-qaza-minus').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pKey = btn.dataset.prayer;
        storage.decrementQaza(pKey, 1);
        audioEngine.playMilestoneCelebration();
        audioEngine.vibrate([40, 30, 80]);
        this.renderQazaView();
      });
    });

    grid.querySelectorAll('.btn-qaza-plus').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pKey = btn.dataset.prayer;
        storage.incrementQaza(pKey, 1);
        audioEngine.playTasbeehClick();
        this.renderQazaView();
      });
    });
  }

  // --- QAZA CALCULATOR MODAL ---
  openQazaCalcModal() {
    const qaza = storage.getQazaData();
    const meta = qaza.calculatorMeta || { ageAtPuberty: 14, currentAge: 25, missedYears: 0 };

    document.getElementById('input-qaza-puberty').value = meta.ageAtPuberty;
    document.getElementById('input-qaza-age').value = meta.currentAge;
    document.getElementById('input-qaza-missed-years').value = meta.missedYears || '';

    document.getElementById('modal-qaza-calc').classList.add('active');
  }

  applyQazaCalculation() {
    const ageAtPuberty = Number(document.getElementById('input-qaza-puberty').value) || 14;
    const currentAge = Number(document.getElementById('input-qaza-age').value) || 25;
    const missedYears = Number(document.getElementById('input-qaza-missed-years').value) || 0;

    storage.calculateQazaUmri({ ageAtPuberty, currentAge, missedYears });
    document.getElementById('modal-qaza-calc').classList.remove('active');
    this.renderQazaView();
    audioEngine.playMilestoneCelebration();
  }

  // --- TILAWAT (QURAN) VIEW RENDERING ---
  renderTilawatView() {
    const listEl = document.getElementById('surah-list-container');
    if (!listEl) return;
    listEl.innerHTML = '';

    const query = this.surahSearchQuery || '';
    const filter = this.surahFilterCategory || 'all';
    const essentialNumbers = [1, 2, 18, 36, 55, 56, 67, 108, 112, 113, 114];

    const filtered = ALL_SURAHS_INDEX.filter((surah) => {
      // Filter by category pill
      if (filter === 'essential' && !essentialNumbers.includes(surah.number)) {
        return false;
      }
      if (filter === 'makki' && surah.type !== 'Makki') {
        return false;
      }
      if (filter === 'madani' && surah.type !== 'Madani') {
        return false;
      }

      // Filter by search query
      if (query) {
        const numMatch = String(surah.number) === query;
        const enMatch = surah.nameEnglish.toLowerCase().includes(query);
        const urMatch = surah.nameUrdu.includes(query);
        const arMatch = surah.nameArabic.includes(query);
        const meanMatch = (surah.meaning || '').toLowerCase().includes(query);
        return numMatch || enMatch || urMatch || arMatch || meanMatch;
      }

      return true;
    });

    const badge = document.getElementById('surahs-count-badge');
    if (badge) {
      badge.textContent = `📖 ${filtered.length} سورتیں`;
    }

    if (filtered.length === 0) {
      listEl.innerHTML = '<div style="text-align: center; padding: 40px; color: #94a3b8;">کوئی سورت نہیں ملی۔ برائے مہربانی تلاش کا لفظ بدلیں۔</div>';
      return;
    }

    // Featured Ayat-ul-Kursi Quick Access Card
    if (filter === 'all' || filter === 'essential' || !query) {
      const ayatKursiCard = document.createElement('div');
      ayatKursiCard.className = 'card';
      ayatKursiCard.style.background = 'linear-gradient(135deg, rgba(6, 78, 59, 0.95) 0%, rgba(15, 23, 42, 0.95) 100%)';
      ayatKursiCard.style.border = '1.5px solid #fbbf24';
      ayatKursiCard.style.cursor = 'pointer';
      ayatKursiCard.style.padding = '14px 16px';
      ayatKursiCard.style.marginBottom = '12px';
      ayatKursiCard.style.borderRadius = '16px';
      ayatKursiCard.style.boxShadow = '0 4px 15px rgba(245, 158, 11, 0.2)';

      ayatKursiCard.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 40px; height: 40px; border-radius: 12px; background: rgba(245, 158, 11, 0.2); border: 1.5px solid rgba(245, 158, 11, 0.5); display: flex; align-items: center; justify-content: center; font-size: 20px;">
              ✨
            </div>
            <div>
              <div style="font-size: 11px; color: #fbbf24; font-weight: 700;">عظیم ترین قرآنی وظیفہ</div>
              <div style="font-weight: 700; font-size: 15px; color: #ffffff;">آیت الکرسی (Ayat-ul-Kursi)</div>
              <div style="font-size: 11px; color: #a7f3d0;">سورۃ البقرۃ: آیت ۲۵۵ • حفاظت و برکت</div>
            </div>
          </div>
          <div style="font-family: var(--font-arabic); font-size: 20px; color: #fbbf24;">آيَةُ الْكُرْسِيِّ</div>
        </div>
      `;

      ayatKursiCard.addEventListener('click', () => {
        const baqarahMeta = ALL_SURAHS_INDEX.find(s => s.number === 2);
        if (baqarahMeta) {
          this.openSurahReader(baqarahMeta, 255);
        }
      });

      listEl.appendChild(ayatKursiCard);
    }

    filtered.forEach((surah) => {
      const card = document.createElement('div');
      card.className = 'card';
      card.style.cursor = 'pointer';
      card.style.transition = 'all 0.2s';
      card.style.display = 'flex';
      card.style.alignItems = 'center';
      card.style.justifyContent = 'space-between';
      card.style.padding = '14px 16px';
      card.style.marginBottom = '10px';
      card.style.borderRadius = '16px';

      card.innerHTML = `
        <div style="display: flex; align-items: center; gap: 14px;">
          <div style="width: 38px; height: 38px; border-radius: 12px; background: rgba(16, 185, 129, 0.15); border: 1.5px solid rgba(16, 185, 129, 0.35); display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 13px; color: #34d399;">
            ${surah.number}
          </div>
          <div>
            <div style="font-weight: 700; font-size: 15px; color: #f1f5f9;">${surah.nameEnglish}</div>
            <div style="font-size: 12px; color: #94a3b8;">${surah.meaning} • ${surah.totalVerses} آیات (${surah.type === 'Makki' ? 'مکی' : 'مدنی'})</div>
          </div>
        </div>
        <div style="text-align: left;">
          <div style="font-family: var(--font-arabic); font-size: 20px; color: #fbbf24;">${surah.nameArabic}</div>
          <div style="font-family: var(--font-urdu); font-size: 13px; color: #a7f3d0;">${surah.nameUrdu}</div>
        </div>
      `;

      card.addEventListener('click', () => {
        this.openSurahReader(surah);
      });

      listEl.appendChild(card);
    });
  }

  scrollToAyah(ayahNumber) {
    const targetBox = document.getElementById(`verse-box-${ayahNumber}`);
    if (targetBox) {
      targetBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
      targetBox.style.borderColor = '#fbbf24';
      targetBox.style.boxShadow = '0 0 25px rgba(251, 191, 36, 0.6)';
      setTimeout(() => {
        targetBox.style.borderColor = '';
        targetBox.style.boxShadow = '';
      }, 2500);
    }
  }

  async openSurahReader(surahMeta, targetAyahNumber = null) {
    this.stopTilawatPlayback();
    document.getElementById('surah-list-view').style.display = 'none';
    const readerView = document.getElementById('surah-reader-view');
    readerView.style.display = 'block';

    // Update sticky pinned reader titles
    const stickyTitle = document.getElementById('sticky-surah-title');
    if (stickyTitle) {
      stickyTitle.textContent = surahMeta.nameArabic;
    }
    const stickySubtitle = document.getElementById('sticky-surah-subtitle');
    if (stickySubtitle) {
      stickySubtitle.textContent = `${surahMeta.nameUrdu} • کل آیات: ${surahMeta.totalVerses} (${surahMeta.type === 'Makki' ? 'مکی سورت' : 'مدنی سورت'})`;
    }

    // Optional legacy header titles if present
    const oldTitleEn = document.getElementById('reader-surah-title-en');
    if (oldTitleEn) oldTitleEn.textContent = `${surahMeta.nameEnglish} (${surahMeta.meaning || ''})`;
    const oldTitleAr = document.getElementById('reader-surah-title-ar');
    if (oldTitleAr) oldTitleAr.textContent = surahMeta.nameArabic;
    const oldVirtue = document.getElementById('reader-surah-virtue');
    if (oldVirtue) oldVirtue.textContent = `${surahMeta.nameUrdu} • کل آیات: ${surahMeta.totalVerses} • (${surahMeta.type === 'Makki' ? 'مکی سورت' : 'مدنی سورت'})`;

    // Configure Quick Ayah Jump Input
    const jumpInput = document.getElementById('input-jump-ayah');
    const jumpBtn = document.getElementById('btn-jump-ayah');
    if (jumpInput && jumpBtn) {
      jumpInput.value = '';
      jumpInput.max = surahMeta.totalVerses;
      jumpInput.placeholder = `1-${surahMeta.totalVerses}`;
      
      const doAyahJump = () => {
        const ayahNum = parseInt(jumpInput.value, 10);
        if (ayahNum >= 1 && ayahNum <= surahMeta.totalVerses) {
          this.scrollToAyah(ayahNum);
        }
      };

      jumpBtn.onclick = doAyahJump;
      jumpInput.onkeydown = (e) => {
        if (e.key === 'Enter') {
          doAyahJump();
        }
      };
    }

    // Configure Special Quick Section Shortcuts
    const shortcutsContainer = document.getElementById('reader-special-shortcuts');
    if (shortcutsContainer) {
      shortcutsContainer.innerHTML = '';
      if (surahMeta.number === 2) {
        // Surah Al-Baqarah special shortcuts
        shortcutsContainer.style.display = 'flex';
        shortcutsContainer.innerHTML = `
          <button class="surah-shortcut-pill" data-ayah="1">🕌 آغاز سورت (آیت ۱)</button>
          <button class="surah-shortcut-pill" data-ayah="255">✨ آیت الکرسی (آیت ۲۵۵)</button>
          <button class="surah-shortcut-pill" data-ayah="285">🤲 آخری ۲ آیات (آیت ۲۸۵-۲۸۶)</button>
        `;
      } else if (surahMeta.number === 36) {
        // Surah Yaseen shortcuts
        shortcutsContainer.style.display = 'flex';
        shortcutsContainer.innerHTML = `
          <button class="surah-shortcut-pill" data-ayah="1">📖 آغاز (آیت ۱)</button>
          <button class="surah-shortcut-pill" data-ayah="58">🕊️ سلام قولا (آیت ۵۸)</button>
          <button class="surah-shortcut-pill" data-ayah="82">🤲 کن فیکون (آیت ۸۲)</button>
        `;
      } else if (surahMeta.totalVerses > 30) {
        shortcutsContainer.style.display = 'flex';
        const mid = Math.floor(surahMeta.totalVerses / 2);
        shortcutsContainer.innerHTML = `
          <button class="surah-shortcut-pill" data-ayah="1">آغاز (آیت ۱)</button>
          <button class="surah-shortcut-pill" data-ayah="${mid}">درمیان (آیت ${mid})</button>
          <button class="surah-shortcut-pill" data-ayah="${surahMeta.totalVerses}">اختتام (آیت ${surahMeta.totalVerses})</button>
        `;
      } else {
        shortcutsContainer.style.display = 'none';
      }

      shortcutsContainer.querySelectorAll('.surah-shortcut-pill').forEach(btn => {
        btn.onclick = () => {
          const aNum = parseInt(btn.dataset.ayah, 10);
          this.scrollToAyah(aNum);
        };
      });
    }

    const versesContainer = document.getElementById('reader-verses-container');
    versesContainer.innerHTML = '<div style="text-align: center; padding: 40px; color: #a7f3d0;"><div style="font-size: 28px; margin-bottom: 8px;">📖</div>سورت مبارکہ لوڈ ہو رہی ہے...</div>';

    // Always load 100% complete verses from offline JSON file
    let verses = [];
    if (this.loadedSurahsCache[surahMeta.number]) {
      verses = this.loadedSurahsCache[surahMeta.number];
    } else {
      try {
        const res = await fetch(`./data/quran/surahs/${surahMeta.number}.json`);
        if (res.ok) {
          const data = await res.json();
          verses = (data.verses || []).map(v => ({
            number: v.verse,
            arabic: v.arabic,
            urdu: v.urdu
          }));
          this.loadedSurahsCache[surahMeta.number] = verses;
        }
      } catch (err) {
        console.warn('Could not load surah JSON:', err);
      }
    }

    const fullSurah = { ...surahMeta, verses };
    this.activeSurah = fullSurah;
    this.renderSurahVerses(fullSurah, targetAyahNumber);
    storage.saveBookmark(surahMeta.number, targetAyahNumber || 1);
  }

  tokenizeArabic(arabicText) {
    const isWaqfToken = (token) => /^[\u06D6-\u06ED\u0610-\u061A\u08D0-\u08FF\s]+$/.test(token.trim());
    const rawTokens = (arabicText || '').trim().split(/\s+/).filter(Boolean);
    const words = [];
    for (const token of rawTokens) {
      if (isWaqfToken(token) && words.length > 0) {
        words[words.length - 1] += ' ' + token;
      } else {
        words.push(token);
      }
    }
    return words;
  }

  renderSurahVerses(surah, targetAyahNumber = null) {
    // Tilawat Player Controls
    const btnPlayAll = document.getElementById('btn-play-all-verses');
    const btnStopTilawat = document.getElementById('btn-stop-tilawat');

    if (btnPlayAll) {
      btnPlayAll.onclick = () => {
        if (this.isContinuousTilawatPlaying) {
          this.stopTilawatPlayback();
        } else {
          this.playSurahFromVerse(surah, 0);
        }
      };
    }

    if (btnStopTilawat) {
      btnStopTilawat.onclick = () => {
        this.stopTilawatPlayback();
      };
    }

    const versesContainer = document.getElementById('reader-verses-container');
    versesContainer.innerHTML = '';

    // Bismillah Calligraphy Header (For all Surahs except Surah At-Tawbah #9)
    if (surah.number !== 9) {
      const bismillahCard = document.createElement('div');
      bismillahCard.className = 'card';
      bismillahCard.style.textAlign = 'center';
      bismillahCard.style.background = 'radial-gradient(circle at center, rgba(6, 78, 59, 0.45) 0%, rgba(10, 23, 21, 0.85) 100%)';
      bismillahCard.style.border = '1px solid rgba(251, 191, 36, 0.3)';
      bismillahCard.style.padding = '12px 14px';
      bismillahCard.style.marginBottom = '14px';
      bismillahCard.style.borderRadius = '16px';
      bismillahCard.innerHTML = `
        <div style="font-family: var(--font-arabic); font-size: 25px; color: #fbbf24; line-height: 1.8;">بِسۡمِ اللّٰهِ الرَّحۡمٰنِ الرَّحِيۡمِ</div>
        <div style="font-size: 12px; color: #94a3b8; font-family: var(--font-urdu); margin-top: 3px;">شروع اللہ کا نام لے کر جو بڑا مہربان نہایت رحم والا ہے</div>
      `;
      versesContainer.appendChild(bismillahCard);
    }

    // High performance single-reflow rendering using DocumentFragment
    const fragment = document.createDocumentFragment();

    surah.verses.forEach((verse, idx) => {
      const verseBox = document.createElement('div');
      verseBox.className = 'card verse-card-item';
      verseBox.id = `verse-box-${verse.number}`;
      verseBox.style.marginBottom = '12px';
      verseBox.style.padding = '14px 16px';
      verseBox.style.transition = 'all 0.3s ease';

      // Split Arabic text into individual spoken words for instant color sync
      const words = this.tokenizeArabic(verse.arabic);
      const wordsHtml = words.map((w, wIdx) => 
        `<span class="quran-word" id="word-${verse.number}-${wIdx}" data-word-idx="${wIdx}">${w}</span>`
      ).join(' ');

      // Check if this verse is a special milestone (like Ayat-ul-Kursi in Surah 2)
      const isAyatKursi = (surah.number === 2 && verse.number === 255);

      verseBox.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 50%; background: rgba(245, 158, 11, 0.2); color: #fbbf24; font-size: 11px; font-weight: 700; border: 1px solid rgba(245, 158, 11, 0.35);">
              ${verse.number}
            </span>
            ${isAyatKursi ? '<span style="font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 6px; background: rgba(245, 158, 11, 0.25); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.4);">✨ آيَةُ الْكُرْسِيِّ</span>' : ''}
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="verse-status-label" style="display: none; font-size: 10px; padding: 3px 8px; border-radius: 6px; background: rgba(245, 158, 11, 0.25); color: #fbbf24; font-weight: 700;">
              🔊 تلاوت ہو رہی ہے...
            </span>
            <button class="icon-btn verse-audio-btn" id="btn-verse-${verse.number}" title="عربی تلاوت سنیں" style="width: 36px; height: 36px; border-radius: 10px; background: rgba(16, 185, 129, 0.2); border: 1.5px solid rgba(16, 185, 129, 0.4); color: #34d399; display: flex; align-items: center; justify-content: center; cursor: pointer;">
              <span class="verse-btn-icon" style="font-size: 14px;">▶</span>
            </button>
          </div>
        </div>
        <div class="arabic-text" id="arabic-text-${verse.number}" style="font-size: ${this.arabicFontSize}px; margin-bottom: 10px; line-height: 2.2;">
          ${wordsHtml}
        </div>
        <div class="urdu-text" style="margin-bottom: 6px; font-size: 14px; color: #cbd5e1; line-height: 1.8;">
          ${verse.urdu}
        </div>
      `;

      const playBtn = verseBox.querySelector('.verse-audio-btn');
      playBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (audioEngine.isPlayingTilawat && audioEngine.currentRecitingVerse === verse.number) {
          this.stopTilawatPlayback();
        } else {
          // Play continuously starting from this verse
          this.playSurahFromVerse(surah, idx);
        }
      });

      fragment.appendChild(verseBox);
    });

    versesContainer.appendChild(fragment);

    // If target Ayah specified (e.g. 255 for Ayat-ul-Kursi), smooth-scroll to it
    if (targetAyahNumber) {
      setTimeout(() => this.scrollToAyah(targetAyahNumber), 300);
    }
  }

  highlightActiveWord(verseNumber, activeIdx, totalWords) {
    for (let i = 0; i < totalWords; i++) {
      const el = document.getElementById(`word-${verseNumber}-${i}`);
      if (!el) continue;
      if (i === activeIdx) {
        if (!el.classList.contains('word-active-now')) {
          el.className = 'quran-word word-active-now';
        }
      } else {
        if (el.className !== 'quran-word') {
          el.className = 'quran-word';
        }
      }
    }
  }

  clearWordHighlights(verseNumber = null) {
    if (verseNumber) {
      const parent = document.getElementById(`verse-box-${verseNumber}`);
      if (parent) {
        parent.querySelectorAll('.quran-word').forEach(w => {
          w.className = 'quran-word';
        });
      }
    } else {
      document.querySelectorAll('.quran-word').forEach(w => {
        w.className = 'quran-word';
      });
    }
  }

  playSingleAyah(surah, index, onFinishCallback = null) {
    if (!surah || !surah.verses || index < 0 || index >= surah.verses.length) {
      if (onFinishCallback) onFinishCallback();
      return;
    }

    const verse = surah.verses[index];

    // Reset all verse highlights first
    this.clearVerseHighlights();

    // Highlight current active verse
    const verseBox = document.getElementById(`verse-box-${verse.number}`);
    if (verseBox) {
      verseBox.classList.add('verse-reciting-active');
      const statusLabel = verseBox.querySelector('.verse-status-label');
      if (statusLabel) statusLabel.style.display = 'inline-block';

      const btn = verseBox.querySelector('.verse-audio-btn');
      if (btn) {
        btn.classList.add('verse-btn-reciting');
        const icon = btn.querySelector('.verse-btn-icon');
        if (icon) icon.textContent = '⏹';
      }

      // Smooth scroll into viewport
      verseBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // Update status badge
    const statusPill = document.getElementById('tilawat-status-pill');
    if (statusPill) {
      statusPill.textContent = `● آیت ${verse.number} تلاوت جاری ہے`;
      statusPill.style.backgroundColor = 'rgba(245, 158, 11, 0.25)';
      statusPill.style.color = '#fbbf24';
    }

    const words = this.tokenizeArabic(verse.arabic);
    const totalWords = words.length;
    let lastActiveIdx = -1;

    // Direct synchronous in-memory timing lookup from QURAN_WORD_TIMINGS
    const wordStartTimes = (QURAN_WORD_TIMINGS[surah.number] && QURAN_WORD_TIMINGS[surah.number][verse.number]) || [];

    // Advance lead offset (240ms) compensates for audio buffer latency so word turns yellow instantly as sound begins
    const LEAD_OFFSET_MS = 240;

    const onProgress = (currentSec, totalSec) => {
      if (totalWords === 0) return;
      const curMs = (currentSec * 1000) + LEAD_OFFSET_MS;
      let wordIdx = 0;

      // 1. Exact millisecond segment match from Alafasy recitations
      if (wordStartTimes && wordStartTimes.length > 0) {
        let segIdx = 0;
        for (let i = 0; i < wordStartTimes.length; i++) {
          if (curMs >= wordStartTimes[i]) {
            segIdx = i;
          } else {
            break;
          }
        }
        if (wordStartTimes.length === totalWords) {
          wordIdx = segIdx;
        } else {
          wordIdx = Math.min(totalWords - 1, Math.floor(segIdx * (totalWords / wordStartTimes.length)));
        }
      } else {
        // 2. Intelligent fallback if timings missing: Tajweed Madd elongation + tail silence removed
        const effectiveSec = Math.max(0.1, totalSec * 0.82);
        const effectiveRatio = Math.min(1.0, (currentSec + (LEAD_OFFSET_MS / 1000)) / effectiveSec);
        const totalWeight = (totalWords - 1) + 3.0;
        const progressWeight = effectiveRatio * totalWeight;
        wordIdx = Math.min(totalWords - 1, Math.floor(progressWeight));
      }

      if (wordIdx !== lastActiveIdx) {
        lastActiveIdx = wordIdx;
        this.highlightActiveWord(verse.number, wordIdx, totalWords);
      }
    };

    // Highlight the very first word in yellow immediately
    this.highlightActiveWord(verse.number, 0, totalWords);

    // Play authentic Arabic recitation (Mishary Alafasy offline MP3 + Arabic Speech fallback)
    audioEngine.playVerseAudio(surah.number, verse.number, verse.arabic, () => {
      // Verse ended
      if (verseBox) {
        verseBox.classList.remove('verse-reciting-active');
        const statusLabel = verseBox.querySelector('.verse-status-label');
        if (statusLabel) statusLabel.style.display = 'none';

        const btn = verseBox.querySelector('.verse-audio-btn');
        if (btn) {
          btn.classList.remove('verse-btn-reciting');
          const icon = btn.querySelector('.verse-btn-icon');
          if (icon) icon.textContent = '▶';
        }
      }

      this.clearWordHighlights(verse.number);

      if (typeof onFinishCallback === 'function') {
        onFinishCallback();
      } else {
        this.stopTilawatPlayback();
      }
    }, onProgress, surah);
  }

  playSurahFromVerse(surah, startIndex = 0) {
    this.isContinuousTilawatPlaying = true;
    this.currentRecitingAyahIndex = startIndex;
    const btnPlayAll = document.getElementById('btn-play-all-verses');
    if (btnPlayAll) {
      btnPlayAll.classList.add('playing');
      const icon = document.getElementById('tilawat-main-play-icon');
      if (icon) icon.textContent = '⏸';
    }

    const playStep = (idx) => {
      if (!this.isContinuousTilawatPlaying || !this.activeSurah || this.activeSurah.number !== surah.number) {
        this.stopTilawatPlayback();
        return;
      }

      if (idx >= surah.verses.length) {
        // Completed entire Surah
        this.stopTilawatPlayback();
        return;
      }

      this.currentRecitingAyahIndex = idx;

      this.playSingleAyah(surah, idx, () => {
        if (this.isContinuousTilawatPlaying) {
          // Play next verse immediately without setTimeout so mobile OS doesn't sleep in background
          playStep(idx + 1);
        }
      });
    };

    playStep(startIndex);
  }

  clearVerseHighlights() {
    this.clearWordHighlights();
    document.querySelectorAll('.verse-card-item').forEach((box) => {
      box.classList.remove('verse-reciting-active');
      const label = box.querySelector('.verse-status-label');
      if (label) label.style.display = 'none';

      const btn = box.querySelector('.verse-audio-btn');
      if (btn) {
        btn.classList.remove('verse-btn-reciting');
        const icon = btn.querySelector('.verse-btn-icon');
        if (icon) icon.textContent = '▶';
      }
    });
  }

  stopTilawatPlayback() {
    this.isContinuousTilawatPlaying = false;
    audioEngine.stopTilawat();
    this.clearVerseHighlights();

    const btnPlayAll = document.getElementById('btn-play-all-verses');
    if (btnPlayAll) {
      btnPlayAll.classList.remove('playing');
      const icon = document.getElementById('tilawat-main-play-icon');
      if (icon) icon.textContent = '▶';
    }

    const statusPill = document.getElementById('tilawat-status-pill');
    if (statusPill) {
      statusPill.textContent = '● تیار ہے';
      statusPill.style.backgroundColor = 'rgba(16, 185, 129, 0.2)';
      statusPill.style.color = '#34d399';
    }
  }

  applyQuranFontSize() {
    document.querySelectorAll('.arabic-text').forEach((el) => {
      el.style.fontSize = `${this.arabicFontSize}px`;
    });
  }

  // --- TASBEEH & WAZAIF VIEW RENDERING ---
  setFeedbackMode(mode) {
    this.settings.feedbackMode = mode;
    this.settings.soundEnabled = mode === 'sound';
    this.settings.vibrationEnabled = mode === 'sound' || mode === 'vibrate';
    storage.saveSettings(this.settings);
    this.updateFeedbackModeUI();
    if (mode === 'sound') {
      audioEngine.playTasbeehClick();
      audioEngine.vibrate(25);
    } else if (mode === 'vibrate') {
      audioEngine.vibrate(40);
    }
  }

  updateFeedbackModeUI() {
    const mode = this.settings.feedbackMode || 'sound';
    document.querySelectorAll('.tasbeeh-mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    const select = document.getElementById('select-feedback-mode');
    if (select) select.value = mode;
  }

  updateTasbeehCircleProgress(count, target) {
    const circle = document.getElementById('tasbeeh-progress-circle');
    if (!circle) return;
    const circumference = 2 * Math.PI * 70; // ~439.82
    circle.style.strokeDasharray = `${circumference}`;
    if (!target || target <= 0) {
      circle.style.strokeDashoffset = `${circumference * 0.15}`;
      return;
    }
    const progress = Math.min(count / target, 1);
    const offset = circumference * (1 - progress);
    circle.style.strokeDashoffset = `${offset}`;
  }

  renderTasbeehView() {
    const tasbeeh = storage.getTasbeehData();

    const countBig = document.getElementById('tasbeeh-count-display');
    const targetLabel = document.getElementById('tasbeeh-target-display');
    const lapLabel = document.getElementById('tasbeeh-lap-display');
    const totalLabel = document.getElementById('tasbeeh-lifetime-display');
    const dhikrTitle = document.getElementById('tasbeeh-active-dhikr-title');
    const dhikrTrans = document.getElementById('tasbeeh-active-dhikr-trans');

    if (countBig) countBig.textContent = tasbeeh.currentCount;
    if (targetLabel) targetLabel.textContent = `ہدف: ${tasbeeh.targetCount || 'لامحدود'}`;
    if (lapLabel) lapLabel.textContent = `چکر: ${tasbeeh.lapCount}`;
    if (totalLabel) totalLabel.textContent = tasbeeh.totalLifetimeCount || 0;
    if (dhikrTitle) dhikrTitle.textContent = tasbeeh.currentDhikr.title;
    if (dhikrTrans) dhikrTrans.textContent = tasbeeh.currentDhikr.translation;

    this.updateFeedbackModeUI();
    this.updateTasbeehCircleProgress(tasbeeh.currentCount, tasbeeh.targetCount);

    // Render Wazaif list
    this.renderWazaifList('all');
  }

  incrementTasbeeh() {
    const tasbeeh = storage.getTasbeehData();
    tasbeeh.currentCount = (parseInt(tasbeeh.currentCount, 10) || 0) + 1;
    tasbeeh.totalLifetimeCount = (parseInt(tasbeeh.totalLifetimeCount, 10) || 0) + 1;

    // Check Sound / Vibration feedback mode
    const mode = this.settings.feedbackMode || 'sound';
    if (mode === 'sound') {
      audioEngine.playTasbeehClick();
      audioEngine.vibrate(25);
    } else if (mode === 'vibrate') {
      audioEngine.vibrate(35);
    }

    // Check if target reached
    if (tasbeeh.targetCount > 0 && tasbeeh.currentCount >= tasbeeh.targetCount) {
      tasbeeh.lapCount = (parseInt(tasbeeh.lapCount, 10) || 0) + 1;
      tasbeeh.currentCount = 0;
      if (mode === 'sound') {
        audioEngine.playMilestoneCelebration();
        audioEngine.vibrateMilestone();
      } else if (mode === 'vibrate') {
        audioEngine.vibrateMilestone();
      }
    }

    storage.saveTasbeehData(tasbeeh);

    const countBig = document.getElementById('tasbeeh-count-display');
    const lapLabel = document.getElementById('tasbeeh-lap-display');
    const totalLabel = document.getElementById('tasbeeh-lifetime-display');

    if (countBig) {
      countBig.textContent = tasbeeh.currentCount;
      countBig.classList.add('pulse-pop');
      setTimeout(() => countBig.classList.remove('pulse-pop'), 120);
    }
    if (lapLabel) lapLabel.textContent = `چکر: ${tasbeeh.lapCount}`;
    if (totalLabel) totalLabel.textContent = tasbeeh.totalLifetimeCount || 0;

    this.updateTasbeehCircleProgress(tasbeeh.currentCount, tasbeeh.targetCount);
  }

  showToast(message, duration = 2400) {
    let toast = document.getElementById('app-floating-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'app-floating-toast';
      toast.className = 'app-floating-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(this._toastTimeout);
    this._toastTimeout = setTimeout(() => {
      toast.classList.remove('show');
    }, duration);
  }

  showConfirmationPopup({ title, message, icon = '🔄', confirmText = 'جی ہاں، صفر کریں', cancelText = 'نہیں، منسوخ کریں', onConfirm }) {
    const overlay = document.getElementById('modal-confirm-dialog');
    const titleEl = document.getElementById('confirm-dialog-title');
    const descEl = document.getElementById('confirm-dialog-desc');
    const iconEl = document.getElementById('confirm-dialog-icon');
    const acceptBtn = document.getElementById('btn-confirm-dialog-accept');
    const cancelBtn = document.getElementById('btn-confirm-dialog-cancel');

    if (!overlay) {
      if (confirm(message)) onConfirm?.();
      return;
    }

    if (titleEl) titleEl.textContent = title;
    if (descEl) descEl.textContent = message;
    if (iconEl) iconEl.textContent = icon;
    if (acceptBtn) acceptBtn.textContent = confirmText;
    if (cancelBtn) cancelBtn.textContent = cancelText;

    overlay.style.display = 'flex';

    const closeDialog = () => {
      overlay.style.display = 'none';
      if (acceptBtn) acceptBtn.onclick = null;
      if (cancelBtn) cancelBtn.onclick = null;
      overlay.onclick = null;
    };

    if (acceptBtn) {
      acceptBtn.onclick = () => {
        closeDialog();
        if (typeof onConfirm === 'function') onConfirm();
      };
    }

    if (cancelBtn) {
      cancelBtn.onclick = () => {
        closeDialog();
      };
    }

    overlay.onclick = (e) => {
      if (e.target === overlay) closeDialog();
    };
  }

  resetTasbeeh() {
    const tasbeeh = storage.getTasbeehData();
    const current = Number(tasbeeh.currentCount) || 0;
    const laps = Number(tasbeeh.lapCount) || 0;
    if (current === 0 && laps === 0) {
      this.showToast('موجودہ تسبیح کی گنتی پہلے سے صفر (0) ہے');
      return;
    }
    const promptMsg = laps > 0 
      ? `کیا آپ موجودہ تسبیح کی گنتی (${current}) اور چکر (${laps}) صفر (0) کرنا چاہتے ہیں؟`
      : `کیا آپ موجودہ تسبیح کی گنتی (${current}) صفر (0) کرنا چاہتے ہیں؟`;
    
    this.showConfirmationPopup({
      title: 'موجودہ گنتی صفر کرنے کی تصدیق',
      message: promptMsg,
      icon: '🔄',
      confirmText: 'جی ہاں، گنتی صفر کریں',
      cancelText: 'نہیں، واپس جائیں',
      onConfirm: () => {
        tasbeeh.currentCount = 0;
        tasbeeh.lapCount = 0;
        storage.saveTasbeehData(tasbeeh);

        audioEngine.playSoftChime();
        audioEngine.vibrate(40);
        this.renderTasbeehView();
        this.showToast('موجودہ گنتی صفر کر دی گئی ہے');
      }
    });
  }

  resetLifetimeTasbeeh() {
    const tasbeeh = storage.getTasbeehData();
    const current = Number(tasbeeh.totalLifetimeCount) || 0;
    if (current === 0) {
      this.showToast('کل تسبیحات کا ریکارڈ پہلے سے صفر (0) ہے');
      return;
    }
    this.showConfirmationPopup({
      title: 'کل تسبیحات ریکارڈ صفر کرنے کی تصدیق',
      message: `کیا آپ کل تسبیحات کا مکمل ریکارڈ (${current}) صفر (0) کرنا چاہتے ہیں؟`,
      icon: '🗑️',
      confirmText: 'جی ہاں، کل ریکارڈ صفر کریں',
      cancelText: 'نہیں، محفوظ رکھیں',
      onConfirm: () => {
        tasbeeh.totalLifetimeCount = 0;
        storage.saveTasbeehData(tasbeeh);

        audioEngine.playSoftChime();
        audioEngine.vibrate(50);
        this.renderTasbeehView();
        this.showToast('کل تسبیحات کا ریکارڈ صفر کر دیا گیا ہے');
      }
    });
  }

  changeTasbeehPreset(presetKey) {
    const presets = {
      subhanallah: { title: 'سُبْحَانَ اللَّهِ', translation: 'اللہ پاک ہے (تمام عیوب سے)' },
      alhamdulillah: { title: 'الْحَمْدُ لِلَّهِ', translation: 'تمام تعریفیں اللہ کے لیے ہیں' },
      allahuakbar: { title: 'اللَّهُ أَكْبَرُ', translation: 'اللہ سب سے بڑا ہے' },
      astaghfirullah: { title: 'أَسْتَغْفِرُ اللَّهَ', translation: 'میں اللہ سے بخشش مانگتا ہوں' },
      durood: { title: 'اللَّهُمَّ صَلِّ عَلَى مُحَمَّدٍ', translation: 'اے اللہ! محمد ﷺ پر رحمتیں نازل فرما' },
      lailaha: { title: 'لَا إِلَهَ إِلَّا اللَّهُ', translation: 'اللہ کے سوا کوئی معبود نہیں' },
      kalima: { title: 'لَا إِلَهَ إِلَّا اللَّهُ مُحَمَّدٌ رَسُولُ اللَّهِ', translation: 'اللہ کے سوا کوئی معبود نہیں محمد ﷺ اللہ کے رسول ہیں' },
      hasbunallah: { title: 'حَسْبُنَا اللَّهُ وَنِعْمَ الْوَكِيلُ', translation: 'ہمیں اللہ کافی ہے اور وہ بہترین کارساز ہے' }
    };

    if (presets[presetKey]) {
      const tasbeeh = storage.getTasbeehData();
      tasbeeh.currentDhikr = presets[presetKey];
      tasbeeh.currentCount = 0;
      storage.saveTasbeehData(tasbeeh);
      this.renderTasbeehView();
    }
  }

  changeTasbeehTarget(targetNumber) {
    const tasbeeh = storage.getTasbeehData();
    tasbeeh.targetCount = targetNumber;
    tasbeeh.currentCount = 0;
    storage.saveTasbeehData(tasbeeh);
    this.renderTasbeehView();
  }

  // --- WAZAIF RENDERING ---
  renderWazaifList(category = 'all') {
    const container = document.getElementById('wazaif-items-container');
    if (!container) return;
    container.innerHTML = '';

    const filtered = category === 'all' ? WAZAIF_LIST : WAZAIF_LIST.filter(w => w.category === category);

    filtered.forEach((w) => {
      const card = document.createElement('div');
      card.className = 'card';
      card.style.marginBottom = '12px';

      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
          <div style="font-weight: 700; font-size: 14px; color: #fbbf24;">${w.title}</div>
          <span style="font-size: 11px; background: rgba(16, 185, 129, 0.15); color: #34d399; padding: 2px 8px; border-radius: 8px; font-weight: 700;">
            ${w.targetCount} مرتبہ
          </span>
        </div>
        <div class="arabic-text" style="font-size: 20px; line-height: 2; margin-bottom: 8px;">
          ${w.arabic}
        </div>
        <div class="urdu-text" style="font-size: 13px; margin-bottom: 8px; color: #e2e8f0;">
          ${w.urdu}
        </div>
        <div style="font-size: 11px; color: #94a3b8; background: rgba(0,0,0,0.25); padding: 8px 10px; border-radius: 10px; margin-bottom: 10px;">
          <strong style="color: #fef08a;">فضیلت و ثبوت:</strong> ${w.benefit}
        </div>
        <button class="app-btn app-btn-secondary btn-send-to-tasbeeh" style="padding: 8px 12px; font-size: 12px;" data-id="${w.id}">
          📿 تسبیح کاؤنٹر میں پڑھیں
        </button>
      `;

      card.querySelector('.btn-send-to-tasbeeh')?.addEventListener('click', () => {
        const tasbeeh = storage.getTasbeehData();
        tasbeeh.currentDhikr = { title: w.arabic.slice(0, 45) + '...', translation: w.title };
        tasbeeh.targetCount = w.targetCount;
        tasbeeh.currentCount = 0;
        storage.saveTasbeehData(tasbeeh);
        this.renderTasbeehView();

        // Scroll to top of tasbeeh
        document.getElementById('view-tasbeeh').scrollIntoView({ behavior: 'smooth' });
        audioEngine.playMilestoneCelebration();
      });

      container.appendChild(card);
    });
  }

  // --- ISLAMIC KNOWLEDGE & HISTORY RENDERING ---
  renderKnowledgeView(category = 'namaz_faraiz') {
    const container = document.getElementById('knowledge-items-container');
    if (!container) return;
    container.innerHTML = '';

    if (category === 'namaz_faraiz') {
      NAMAZ_ESSENTIALS.forEach((item) => {
        const card = document.createElement('div');
        card.className = 'knowledge-card';

        let pointsHtml = '';
        item.points.forEach((grp) => {
          pointsHtml += `<div style="font-weight: 700; color: #34d399; margin: 8px 0 6px; font-size: 13px;">${grp.heading}</div>`;
          grp.details.forEach((det) => {
            pointsHtml += `<div class="faraiz-item">${det}</div>`;
          });
        });

        card.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
            <div>
              <h3 style="font-size: 16px; font-weight: 800; color: #fef08a; font-family: var(--font-urdu);">${item.title}</h3>
              <div style="font-size: 11px; color: #94a3b8;">${item.subtitle}</div>
            </div>
            <span style="font-size: 11px; background: rgba(16, 185, 129, 0.15); color: #34d399; padding: 3px 8px; border-radius: 8px; font-weight: 700;">
              فرض و حکم
            </span>
          </div>
          <p style="font-size: 12px; color: #cbd5e1; margin-bottom: 10px; line-height: 1.6; font-family: var(--font-urdu); text-align: right;">
            ${item.summary}
          </p>
          <div class="accordion-content">
            ${pointsHtml}
          </div>
        `;
        container.appendChild(card);
      });
    } else if (category === 'wuzu_faraiz') {
      WUZU_ESSENTIALS.forEach((item) => {
        const card = document.createElement('div');
        card.className = 'knowledge-card';

        let pointsHtml = '';
        item.points.forEach((grp) => {
          pointsHtml += `<div style="font-weight: 700; color: #60a5fa; margin: 8px 0 6px; font-size: 13px;">${grp.heading}</div>`;
          grp.details.forEach((det) => {
            pointsHtml += `<div class="faraiz-item">${det}</div>`;
          });
        });

        card.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
            <div>
              <h3 style="font-size: 16px; font-weight: 800; color: #93c5fd; font-family: var(--font-urdu);">${item.title}</h3>
              <div style="font-size: 11px; color: #94a3b8;">${item.subtitle}</div>
            </div>
            <span style="font-size: 11px; background: rgba(59, 130, 246, 0.15); color: #60a5fa; padding: 3px 8px; border-radius: 8px; font-weight: 700;">
              طہارت
            </span>
          </div>
          <p style="font-size: 12px; color: #cbd5e1; margin-bottom: 10px; line-height: 1.6; font-family: var(--font-urdu); text-align: right;">
            ${item.summary}
          </p>
          <div class="accordion-content">
            ${pointsHtml}
          </div>
        `;
        container.appendChild(card);
      });
    } else if (category === 'islamic_history') {
      ISLAMIC_HISTORY.forEach((hist) => {
        const card = document.createElement('div');
        card.className = 'knowledge-card';

        card.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
            <div style="flex: 1;">
              <h3 style="font-size: 16px; font-weight: 800; color: #fbbf24; font-family: var(--font-urdu);">${hist.title}</h3>
              <div style="margin-top: 4px;">
                <span class="history-era-tag">📅 ${hist.era}</span>
              </div>
            </div>
          </div>
          <div style="font-size: 12px; color: #e2e8f0; font-weight: 600; margin-bottom: 8px; line-height: 1.6; font-family: var(--font-urdu); text-align: right;">
            ${hist.summary}
          </div>
          <div style="font-size: 13px; color: #cbd5e1; line-height: 1.8; font-family: var(--font-urdu); text-align: right; background: rgba(0,0,0,0.25); padding: 12px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.04);">
            ${hist.details}
          </div>
          <div class="history-lesson-box">
            <strong>💡 حاصلِ سبق / اخلاقی درس:</strong> ${hist.lesson}
          </div>
        `;
        container.appendChild(card);
      });
    }
  }

  // --- LIVE TIMERS & ALARM MONITORING ---
  startLiveTimers() {
    let lastDate = new Date().getDate();

    // 1-second interval for countdown timer and clock
    setInterval(() => {
      const now = new Date();
      // Auto-recalculate if midnight has passed
      if (now.getDate() !== lastDate) {
        lastDate = now.getDate();
        this.currentDate = now;
        this.recalculatePrayers();
        this.renderAllViews();
      }

      if (this.prayerTimes && this.activeTab === 'namaz') {
        const status = getPrayerStatus(this.prayerTimes, now);
        const countdownEl = document.getElementById('hero-countdown-time');
        if (countdownEl && status.countdown) countdownEl.textContent = status.countdown.formatted;
      }
    }, 1000);

    // 5-second interval for alarm triggers & Qaza reminders
    this.alarmCheckInterval = setInterval(() => {
      this.checkPrayerAlarms();
      this.checkQazaReminders();
    }, 5000);
  }

  checkPrayerAlarms() {
    if (!this.prayerTimes) return;

    const now = new Date();
    const currentHour = now.getHours();
    const currentMin = now.getMinutes();
    const currentMinuteKey = `${currentHour}:${currentMin}`;

    // Prevent duplicate triggers in same minute
    if (this.lastTriggeredAlarmMinute === currentMinuteKey) return;

    const prayers = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

    for (const key of prayers) {
      const alarmConfig = this.settings.alarms && this.settings.alarms[key];
      if (alarmConfig && alarmConfig.enabled && this.prayerTimes[key]) {
        const pTime = this.prayerTimes[key];
        if (pTime.getHours() === currentHour && pTime.getMinutes() === currentMin) {
          this.lastTriggeredAlarmMinute = currentMinuteKey;
          this.triggerPrayerAlarm(key);
          break;
        }
      }
    }
  }

  triggerPrayerAlarm(prayerKey) {
    const prayerNames = {
      fajr: { en: 'Fajr', ur: 'فجر' },
      dhuhr: { en: 'Dhuhr', ur: 'ظہر' },
      asr: { en: 'Asr', ur: 'عصر' },
      maghrib: { en: 'Maghrib', ur: 'مغرب' },
      isha: { en: 'Isha', ur: 'عشاء' }
    };

    const p = prayerNames[prayerKey] || { en: prayerKey, ur: '' };

    // Play authentic Adhan audio offline
    const voiceSrc = this.settings.adhanVoice || './audio/adhan.mp3';
    audioEngine.playTakbeerAdhan(null, voiceSrc);
    audioEngine.vibrateAlarm();

    // Show Alarm Fullscreen Alert Modal
    const modal = document.getElementById('alarm-modal');
    if (modal) {
      document.getElementById('alarm-prayer-title-en').textContent = `It is time for ${p.en} Prayer`;
      document.getElementById('alarm-prayer-title-ur').textContent = `نمازِ ${p.ur} کا وقت ہو گیا ہے`;
      modal.classList.add('active');
    }

    // Native Notification in mobile notification bar
    const notifTitle = `🕌 وقتِ نماز: ${p.ur} (${p.en})`;
    const notifBody = `نمازِ ${p.ur} کا وقت ہو گیا ہے۔ حی علی الصلاۃ، حی علی الفلاح۔`;
    this.dispatchDeviceNotification(notifTitle, notifBody, 8001);
  }

  dismissAlarm() {
    audioEngine.stopCurrentAudio();
    document.getElementById('alarm-modal')?.classList.remove('active');
  }

  snoozeAlarm() {
    this.dismissAlarm();
    // Re-trigger in 5 minutes
    setTimeout(() => {
      audioEngine.playSoftChime();
    }, 5 * 60 * 1000);
  }

  // --- AUDIO UI SYNCHRONIZATION ---
  updateVoiceLabels() {
    const isMakkah = this.settings.adhanVoice && this.settings.adhanVoice.includes('makkah');
    const label = isMakkah
      ? 'حرمِ مکی شریف اذان (100% آف لائن)'
      : 'قاری مشاری راشد اذان (100% آف لائن)';
    const el = document.getElementById('dash-voice-label');
    if (el) el.textContent = label;
  }

  updateAudioUiState(isPlaying) {
    const banner = document.getElementById('adhan-playing-banner');
    if (banner) {
      banner.style.display = isPlaying ? 'flex' : 'none';
    }

    // Dashboard Test button
    const btnDashTest = document.getElementById('btn-dash-test-adhan');
    if (btnDashTest) {
      if (isPlaying) {
        btnDashTest.innerHTML = '<span>⏸</span><span>اذان جاری ہے...</span>';
        btnDashTest.classList.add('btn-adhan-playing');
      } else {
        btnDashTest.innerHTML = '<span>🔊</span><span>اذان سنیں (Play)</span>';
        btnDashTest.classList.remove('btn-adhan-playing');
      }
    }

    // Dashboard Stop button
    const btnDashStop = document.getElementById('btn-dash-stop-adhan');
    if (btnDashStop) {
      if (isPlaying) {
        btnDashStop.classList.add('btn-stop-azan-pulsing');
      } else {
        btnDashStop.classList.remove('btn-stop-azan-pulsing');
      }
    }

    // Settings Test button
    const btnSettingsTest = document.getElementById('btn-test-adhan');
    if (btnSettingsTest) {
      if (isPlaying) {
        btnSettingsTest.innerHTML = '<span style="font-size: 16px;">⏸</span><span>اذان جاری ہے...</span>';
        btnSettingsTest.classList.add('btn-adhan-playing');
      } else {
        btnSettingsTest.innerHTML = '<span style="font-size: 16px;">🔊</span><span>اذان سنیں (Play)</span>';
        btnSettingsTest.classList.remove('btn-adhan-playing');
      }
    }

    // Settings Stop button
    const btnSettingsStop = document.getElementById('btn-stop-audio');
    if (btnSettingsStop) {
      if (isPlaying) {
        btnSettingsStop.classList.add('btn-stop-azan-pulsing');
      } else {
        btnSettingsStop.classList.remove('btn-stop-azan-pulsing');
      }
    }

    // Badges
    const statusText = isPlaying ? '● اذان چل رہی ہے' : '● تیار ہے';
    const statusBg = isPlaying ? 'rgba(239, 68, 68, 0.25)' : 'rgba(16, 185, 129, 0.2)';
    const statusColor = isPlaying ? '#fca5a5' : '#34d399';

    ['dash-audio-status', 'settings-audio-status'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.textContent = statusText;
        el.style.backgroundColor = statusBg;
        el.style.color = statusColor;
      }
    });
  }

  // --- LOCATION MANAGER (FULL SCREEN PAGE) ---
  openLocationModal() {
    this.openLocationScreen();
  }

  openLocationScreen() {
    this.closeSettingsScreen();
    this.updateLocationModalBanner();
    const searchInput = document.getElementById('input-city-search');
    if (searchInput) searchInput.value = '';
    this.filterCitiesList('');
    const screen = document.getElementById('screen-location');
    if (screen) {
      screen.style.display = 'flex';
    }
  }

  closeLocationScreen() {
    const screen = document.getElementById('screen-location');
    if (screen) {
      screen.style.display = 'none';
    }
    document.querySelectorAll('.nav-item').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === this.activeTab);
    });
  }

  updateLocationModalBanner() {
    const banner = document.getElementById('loc-current-display-title');
    if (!banner) return;
    const loc = this.settings.location;
    if (loc.isGps) {
      banner.textContent = `خودکار GPS کوآرڈینیٹس (${loc.lat.toFixed(2)}°, ${loc.lng.toFixed(2)}°)`;
    } else {
      const match = CITIES_DATABASE.find(c => c.id === loc.cityId);
      if (match) {
        banner.textContent = `${match.urdu} (${match.name}, ${match.province})`;
      } else {
        banner.textContent = `${loc.cityName || 'کراچی'} (${loc.country || 'Pakistan'})`;
      }
    }
  }

  filterCitiesList(query = '', provinceFilter = null) {
    if (provinceFilter !== null && provinceFilter !== undefined) {
      this.activeProvinceFilter = provinceFilter;
    }
    const activeProv = this.activeProvinceFilter || 'all';
    const listEl = document.getElementById('cities-list-container');
    const countEl = document.getElementById('loc-cities-count');
    const clearBtn = document.getElementById('btn-clear-city-search');
    const searchInput = document.getElementById('input-city-search');

    const searchVal = query !== undefined && query !== null ? query : (searchInput ? searchInput.value : '');
    const q = searchVal.toLowerCase().trim();

    if (clearBtn) {
      clearBtn.style.display = q ? 'flex' : 'none';
    }

    if (!listEl) return;
    listEl.innerHTML = '';

    const filtered = CITIES_DATABASE.filter(city => {
      // Province filter
      if (activeProv !== 'all') {
        if (activeProv === 'international') {
          if (city.country === 'Pakistan') return false;
        } else {
          if (city.province !== activeProv) return false;
        }
      }

      // Search query filter
      if (q) {
        const nameMatch = city.name.toLowerCase().includes(q);
        const urduMatch = city.urdu ? city.urdu.includes(q) : false;
        const provMatch = city.province ? city.province.toLowerCase().includes(q) : false;
        const countryMatch = city.country ? city.country.toLowerCase().includes(q) : false;
        return nameMatch || urduMatch || provMatch || countryMatch;
      }
      return true;
    });

    if (countEl) {
      countEl.textContent = `${filtered.length} شہر`;
    }

    if (filtered.length === 0) {
      const emptyEl = document.createElement('div');
      emptyEl.style.cssText = 'text-align: center; padding: 24px 10px; color: #94a3b8; font-size: 13px;';
      emptyEl.innerHTML = `
        <div style="font-size: 26px; margin-bottom: 6px;">🔍</div>
        <div style="font-weight: 700; color: #f8fafc;">کوئی شہر نہیں ملا</div>
        <div style="font-size: 11px; color: #64748b; margin-top: 4px;">براہ کرم شہر کا نام درست اردو یا انگریزی میں لکھیں یا اوپر سے صوبہ منتخب کریں۔</div>
      `;
      listEl.appendChild(emptyEl);
      return;
    }

    filtered.forEach((city) => {
      const isSelected = !this.settings.location.isGps && this.settings.location.cityId === city.id;
      const card = document.createElement('div');
      card.className = `loc-city-card ${isSelected ? 'selected' : ''}`;

      card.innerHTML = `
        <div class="loc-city-info">
          <div class="loc-city-names">
            <span class="loc-city-urdu">${city.urdu || city.name}</span>
            <span class="loc-city-eng">(${city.name})</span>
          </div>
          <div class="loc-city-sub">
            <span class="loc-prov-tag">${city.province}</span>
            <span>•</span>
            <span>${city.country}</span>
            <span>•</span>
            <span>${city.lat.toFixed(2)}°, ${city.lng.toFixed(2)}°</span>
          </div>
        </div>
        <div class="loc-city-status">
          ${isSelected 
            ? '<span class="loc-badge-selected">✓ منتخب</span>' 
            : '<span class="loc-badge-choose">منتخب کریں</span>'}
        </div>
      `;

      card.addEventListener('click', () => {
        this.selectCity(city);
      });

      listEl.appendChild(card);
    });
  }

  selectCity(city) {
    this.settings.location = {
      cityId: city.id,
      cityName: city.urdu || city.name,
      englishName: city.name,
      province: city.province,
      country: city.country,
      lat: city.lat,
      lng: city.lng,
      timezone: city.timezone,
      isGps: false
    };
    storage.saveSettings(this.settings);
    this.recalculatePrayers();
    this.renderHeader();
    this.renderNamazView();
    this.updateLocationModalBanner();
    this.closeLocationScreen();
    this.showToast(`📍 نیا شہر منتخب: ${city.urdu || city.name}`);
    audioEngine.playMilestoneCelebration();
  }

  detectGpsLocation() {
    if (!('geolocation' in navigator)) {
      this.showToast('موبائل براؤزر میں GPS لوکیشن دستیاب نہیں ہے');
      return;
    }

    const btn = document.getElementById('btn-use-gps');
    const origHtml = btn ? btn.innerHTML : '';
    if (btn) {
      btn.innerHTML = `
        <div class="loc-gps-radar-wave" style="animation-duration: 0.8s;">⏳</div>
        <div class="loc-gps-text">
          <div class="loc-gps-title">GPS لوکیشن تلاش کی جا رہی ہے...</div>
          <div class="loc-gps-desc">براہ کرم چند سیکنڈ انتظار فرمائیں...</div>
        </div>
      `;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        // Estimate timezone offset in hours
        const timezone = -(new Date().getTimezoneOffset() / 60);

        this.settings.location = {
          cityId: 'custom-gps',
          cityName: 'GPS لوکیشن',
          country: 'Pakistan',
          lat: parseFloat(lat.toFixed(4)),
          lng: parseFloat(lng.toFixed(4)),
          timezone: timezone,
          isGps: true
        };

        storage.saveSettings(this.settings);
        this.recalculatePrayers();
        this.renderHeader();
        this.renderNamazView();
        this.updateLocationModalBanner();
        this.closeLocationScreen();
        if (btn) btn.innerHTML = origHtml;
        this.showToast('📍 خودکار GPS لوکیشن لاگو ہو گئی ہے');
        audioEngine.playMilestoneCelebration();
      },
      (err) => {
        console.warn('GPS error:', err);
        this.showToast('GPS حاصل نہیں ہو سکا۔ براہ کرم شہر منتخب کریں');
        if (btn) btn.innerHTML = origHtml;
      },
      { timeout: 10000, maximumAge: 600000 }
    );
  }

  // --- SETTINGS (FULL-SCREEN PAGE) & ABOUT MODALS ---
  openSettingsModal() {
    this.openSettingsScreen();
  }

  openSettingsScreen() {
    this.closeLocationScreen();
    this.syncSettingsUI();
    const screen = document.getElementById('screen-settings');
    if (screen) screen.style.display = 'flex';
    document.querySelectorAll('.nav-item').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === 'settings');
    });
  }

  closeSettingsScreen() {
    const screen = document.getElementById('screen-settings');
    if (screen) screen.style.display = 'none';
    document.querySelectorAll('.nav-item').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === this.activeTab);
    });
  }

  syncSettingsUI() {
    const calcSel = document.getElementById('select-calc-method');
    if (calcSel) calcSel.value = this.settings.calcMethod;

    const asrSel = document.getElementById('select-asr-juristic');
    if (asrSel) asrSel.value = this.settings.asrJuristic;

    const chk24 = document.getElementById('toggle-24h');
    if (chk24) chk24.checked = this.settings.is24Hour;

    const chkQaza = document.getElementById('toggle-auto-qaza');
    if (chkQaza) chkQaza.checked = this.settings.autoAddToQaza;

    const selectAdhanVoice = document.getElementById('select-adhan-voice');
    if (selectAdhanVoice && this.settings.adhanVoice) {
      selectAdhanVoice.value = this.settings.adhanVoice;
    }

    const selectFeedback = document.getElementById('select-feedback-mode');
    if (selectFeedback) {
      selectFeedback.value = this.settings.feedbackMode || 'sound';
    }

    ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'].forEach((pKey) => {
      const chk = document.querySelector(`.setting-alarm-chk[data-prayer="${pKey}"]`);
      if (chk) {
        chk.checked = this.settings.alarms && this.settings.alarms[pKey] ? this.settings.alarms[pKey].enabled !== false : true;
      }
    });
  }

  openAboutModal() {
    document.getElementById('modal-about')?.classList.add('active');
  }

  closeModals() {
    audioEngine.stopCurrentAudio();
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
    this.closeLocationScreen();
    this.closeSettingsScreen();
  }

  // --- PWA SERVICE WORKER REGISTRATION ---
  initPWA() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('./sw.js?v=34')
          .then((reg) => {
            console.log('Offline PWA Service Worker Registered:', reg.scope);
            reg.update();
          })
          .catch((err) => console.warn('Service Worker registration skipped:', err));
      });
    }
  }

  // --- ROBUST NOTIFICATIONS ENGINE (ANDROID STATUS BAR & PWA) ---
  initNotifications() {
    setTimeout(() => {
      this.requestDeviceNotificationPermission();
    }, 1200);
  }

  async requestDeviceNotificationPermission() {
    // 1. Android Native Notifier prompt (for Android 13+ POST_NOTIFICATIONS)
    if (window.AndroidNativeNotifier && typeof window.AndroidNativeNotifier.promptPermission === 'function') {
      try {
        window.AndroidNativeNotifier.promptPermission();
      } catch (_) {}
    }

    // 2. Capacitor LocalNotifications plugin request
    const LocalNotifications = window.Capacitor?.Plugins?.LocalNotifications;
    if (LocalNotifications) {
      try {
        await LocalNotifications.requestPermissions();
      } catch (_) {}
    }

    // 3. Web Notification API request
    if ('Notification' in window && Notification.permission === 'default') {
      try {
        await Notification.requestPermission();
      } catch (_) {}
    }
  }

  async dispatchDeviceNotification(title, body, id = 0) {
    const notifId = id || Math.floor(Math.random() * 90000) + 1000;
    let delivered = false;

    // 1. Android Native Notifier Bridge (Direct to Android NotificationManagerCompat & System Status Bar)
    if (window.AndroidNativeNotifier && typeof window.AndroidNativeNotifier.showNotification === 'function') {
      try {
        window.AndroidNativeNotifier.showNotification(title, body, notifId);
        delivered = true;
      } catch (err) {
        console.warn('Native Android bridge notification error:', err);
      }
    }

    // 2. Capacitor LocalNotifications Plugin (Android & iOS Native Heads-Up Banner)
    const LocalNotifications = window.Capacitor?.Plugins?.LocalNotifications;
    if (LocalNotifications) {
      try {
        await LocalNotifications.createChannel({
          id: 'noor_namaz_channel',
          name: 'Noor-e-Namaz Alerts (نماز و قضاء الرٹس)',
          description: 'Prayer time Adhan, Qaza alerts and daily Islamic notifications',
          importance: 5,
          visibility: 1,
          vibration: true,
          lights: true,
          lightColor: '#10b981'
        }).catch(() => {});

        await LocalNotifications.schedule({
          notifications: [
            {
              title: title,
              body: body,
              id: notifId,
              channelId: 'noor_namaz_channel',
              smallIcon: 'ic_launcher_round',
              iconColor: '#064e3b',
              schedule: { at: new Date(Date.now() + 100) }
            }
          ]
        });
        delivered = true;
      } catch (err) {
        console.warn('Capacitor LocalNotifications error:', err);
      }
    }

    // 3. PWA Service Worker showNotification (Android Chrome / Safari / Edge PWA)
    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.ready;
        if (reg && typeof reg.showNotification === 'function') {
          await reg.showNotification(title, {
            body: body,
            icon: './icons/icon-192.png',
            badge: './icons/icon-192.png',
            vibrate: [200, 100, 200],
            tag: `noor-notif-${notifId}`,
            renotify: true
          });
          delivered = true;
        }
      } catch (err) {
        console.warn('ServiceWorker showNotification error:', err);
      }
    }

    // 4. Standard Web Notification API fallback
    if (!delivered && 'Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(title, {
          body: body,
          icon: './icons/icon-192.png',
          badge: './icons/icon-192.png'
        });
        delivered = true;
      } catch (err) {
        console.warn('HTML5 Notification error:', err);
      }
    }

    return delivered;
  }
}

// Robust Application Instantiation (handles both deferred modules and early DOM ready)
const startApp = () => {
  if (!window.noorApp) {
    try {
      window.noorApp = new IslamicApp();
    } catch (err) {
      console.error('Fatal initialization error:', err);
      if (typeof window.__dismissSplash === 'function') {
        window.__dismissSplash();
      }
    }
  }
};

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', startApp);
} else {
  startApp();
}
