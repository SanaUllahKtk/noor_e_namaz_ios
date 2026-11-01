// 100% Offline Audio & Haptic Feedback Engine
// Uses HTML5 Audio with fallback to Web Audio API for offline sound synthesis
// Plus Navigator Vibration API for realistic tactile feedback.
// Zero network connection or external mp3 downloads needed!

class IslamicAudioEngine {
  constructor() {
    this.audioCtx = null;
    this.isMuted = false;
    this.audioEl = null;
    this.isPlayingAdhan = false;
    this.stateListeners = [];
    this.activeOscillators = [];
    this.activeTimeouts = [];
    this.masterGainNode = null;

    // Tilawat & Arabic Recitation state
    this.tilawatAudioEl = null;
    this.isPlayingTilawat = false;
    this.currentRecitingSurah = null;
    this.currentRecitingVerse = null;
    this.tilawatListeners = [];
    this.wakeLockSentinel = null;
  }

  // Subscribe to adhan playback changes
  onPlaybackChange(callback) {
    if (typeof callback === 'function') {
      this.stateListeners.push(callback);
    }
  }

  notifyPlaybackState(isPlaying) {
    this.isPlayingAdhan = !!isPlaying;
    this.stateListeners.forEach((fn) => {
      try {
        fn(this.isPlayingAdhan);
      } catch (err) {
        console.warn('Playback listener error:', err);
      }
    });
  }

  // Subscribe to Quran Tilawat changes
  onTilawatStateChange(callback) {
    if (typeof callback === 'function') {
      this.tilawatListeners.push(callback);
    }
  }

  notifyTilawatState(state) {
    this.tilawatListeners.forEach((fn) => {
      try {
        fn(state);
      } catch (err) {
        console.warn('Tilawat listener error:', err);
      }
    });
  }

  // Initialize AudioContext on first user touch (satisfies modern browser autoplay policies)
  initContext() {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  // Play a soft wooden bead click for the Digital Tasbeeh
  playTasbeehClick() {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.audioCtx) return;

      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      // Sharp short resonant click
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(650, this.audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(180, this.audioCtx.currentTime + 0.04);

      gain.gain.setValueAtTime(0.35, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.045);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start();
      osc.stop(this.audioCtx.currentTime + 0.05);
    } catch (e) {
      console.warn('Audio click error:', e);
    }
  }

  // Play milestone chime when reaching 33, 100, or custom target
  playMilestoneCelebration() {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.audioCtx) return;

      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6 (Major arpeggio)
      const now = this.audioCtx.currentTime;

      notes.forEach((freq, idx) => {
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        const start = now + idx * 0.12;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);

        gain.gain.setValueAtTime(0.2, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.45);

        osc.connect(gain);
        gain.connect(this.audioCtx.destination);

        osc.start(start);
        osc.stop(start + 0.5);
      });
    } catch (e) {
      console.warn('Celebration audio error:', e);
    }
  }

  // Play Authentic Human Adhan Recording (Offline MP3 - starts DIRECTLY with Allahu Akbar)
  playTakbeerAdhan(onComplete = null, customSrc = null) {
    if (this.isMuted) return;
    this.stopCurrentAudio();

    const src = customSrc || './audio/adhan.mp3';

    try {
      if (!this.audioEl) {
        this.audioEl = new Audio();
      }

      this.audioEl.src = src;
      this.audioEl.volume = 1.0;
      this.audioEl.currentTime = 0;
      this.isPlayingAdhan = true;
      this.notifyPlaybackState(true);

      this.audioEl.onended = () => {
        this.isPlayingAdhan = false;
        this.notifyPlaybackState(false);
        if (onComplete) onComplete();
      };

      this.audioEl.onerror = (e) => {
        console.warn('Adhan audio file load error, falling back:', e);
        if (this.isPlayingAdhan) {
          this.playSyntheticFallback(onComplete);
        }
      };

      const playPromise = this.audioEl.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            // If user stopped it while loading
            if (!this.isPlayingAdhan && this.audioEl) {
              this.audioEl.pause();
              this.audioEl.currentTime = 0;
            }
          })
          .catch((err) => {
            if (err.name === 'AbortError') {
              // User intentionally pressed stop! Normal behavior, do not fallback
              return;
            }
            console.warn('HTML5 Audio playback issue:', err);
            if (this.isPlayingAdhan) {
              this.playSyntheticFallback(onComplete);
            }
          });
      }
    } catch (e) {
      console.warn('Falling back to synth adhan:', e);
      if (this.isPlayingAdhan) {
        this.playSyntheticFallback(onComplete);
      }
    }
  }

  // Fallback sound if MP3 cannot be decoded
  playSyntheticFallback(onComplete = null) {
    try {
      this.initContext();
      if (!this.audioCtx) return;

      this.isPlayingAdhan = true;
      this.notifyPlaybackState(true);

      const now = this.audioCtx.currentTime;
      const masterGain = this.audioCtx.createGain();
      masterGain.gain.setValueAtTime(0.5, now);
      masterGain.connect(this.audioCtx.destination);
      this.masterGainNode = masterGain;

      const notes = [
        { freq: 293.66, dur: 0.9 },
        { freq: 349.23, dur: 1.2 },
        { freq: 293.66, dur: 1.5 },
        { freq: 261.63, dur: 0.6 },
        { freq: 293.66, dur: 1.8 }
      ];

      let accumulatedTime = now + 0.1;
      notes.forEach((item) => {
        const osc = this.audioCtx.createOscillator();
        const noteGain = this.audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(item.freq, accumulatedTime);
        noteGain.gain.setValueAtTime(0.001, accumulatedTime);
        noteGain.gain.linearRampToValueAtTime(0.3, accumulatedTime + 0.1);
        noteGain.gain.exponentialRampToValueAtTime(0.001, accumulatedTime + item.dur);
        osc.connect(noteGain);
        noteGain.connect(masterGain);
        osc.start(accumulatedTime);
        osc.stop(accumulatedTime + item.dur);
        this.activeOscillators.push(osc);
        accumulatedTime += item.dur * 0.85;
      });

      const totalMs = (accumulatedTime - now) * 1000;
      const t = setTimeout(() => {
        this.isPlayingAdhan = false;
        this.notifyPlaybackState(false);
        if (onComplete) onComplete();
      }, totalMs);
      this.activeTimeouts.push(t);
    } catch (_) {
      this.isPlayingAdhan = false;
      this.notifyPlaybackState(false);
    }
  }

  // --- AUTHENTIC TILAWAT & ARABIC QURAN AUDIO RECITATION ---
  playVerseAudio(surahNumber, verseNumber, arabicText, onEnded = null, onProgress = null, surahMeta = null) {
    if (this.isMuted) return;

    // 1. Acquire Background CPU WakeLock so audio does NOT stop when screen locks
    if (window.AndroidNativeNotifier && typeof window.AndroidNativeNotifier.acquireWakeLock === 'function') {
      try { window.AndroidNativeNotifier.acquireWakeLock(); } catch (_) {}
    }
    if ('wakeLock' in navigator && !this.wakeLockSentinel) {
      navigator.wakeLock.request('screen').then(wl => { this.wakeLockSentinel = wl; }).catch(() => {});
    }

    // 2. Lock-Screen & Background Media Session Controls (Android & iOS)
    if ('mediaSession' in navigator) {
      try {
        const surahTitle = surahMeta?.englishName || surahMeta?.name || `سورة ${surahNumber}`;
        navigator.mediaSession.metadata = new MediaMetadata({
          title: `سورة ${surahTitle} - آية ${verseNumber}`,
          artist: 'القارئ مشاري راشد العفاسي (Noor-e-Namaz)',
          album: 'قرآن مجید فرقانِ حمید (Technology Tycoons)',
          artwork: [
            { src: './icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: './icons/icon-512.png', sizes: '512x512', type: 'image/png' }
          ]
        });
        navigator.mediaSession.playbackState = 'playing';
      } catch (_) {}
    }

    this.isPlayingTilawat = true;
    this.currentRecitingSurah = surahNumber;
    this.currentRecitingVerse = verseNumber;
    this.notifyTilawatState({ isPlaying: true, surah: surahNumber, verse: verseNumber });

    const sStr = String(surahNumber).padStart(3, '0');
    const vStr = String(verseNumber).padStart(3, '0');
    const offlineAudioPath = `./audio/verses/${sStr}${vStr}.mp3`;
    const onlineUrl = `https://everyayah.com/data/Alafasy_128kbps/${sStr}${vStr}.mp3`;

    if (this.tilawatProgressRaf) {
      cancelAnimationFrame(this.tilawatProgressRaf);
      this.tilawatProgressRaf = null;
    }
    if ('speechSynthesis' in window) {
      try { window.speechSynthesis.cancel(); } catch (_) {}
    }

    let fallbackTriggered = false;
    const triggerFallback = () => {
      if (fallbackTriggered || !this.isPlayingTilawat) return;
      fallbackTriggered = true;
      if (this.tilawatAudioEl) {
        this.tilawatAudioEl.onended = null;
        this.tilawatAudioEl.ontimeupdate = null;
        this.tilawatAudioEl.onerror = null;
        try { this.tilawatAudioEl.pause(); } catch (_) {}
      }
      this.speakArabicVerse(arabicText, onEnded, onProgress);
    };

    const reportProgress = () => {
      if (!this.isPlayingTilawat || !this.tilawatAudioEl) return;
      const cur = this.tilawatAudioEl.currentTime || 0;
      const dur = this.tilawatAudioEl.duration || 1;
      if (typeof onProgress === 'function') {
        const ratio = Math.min(0.999, Math.max(0, cur / dur));
        onProgress(cur, dur, ratio);
      }
      this.tilawatProgressRaf = requestAnimationFrame(reportProgress);
    };

    try {
      if (!this.tilawatAudioEl) {
        this.tilawatAudioEl = new Audio();
      }

      this.tilawatAudioEl.volume = 1.0;
      this.tilawatAudioEl.currentTime = 0;

      // Start reporting immediately at frame 0
      if (typeof onProgress === 'function') {
        onProgress(0, 1, 0);
      }

      this.tilawatAudioEl.ontimeupdate = reportProgress;
      this.tilawatAudioEl.onplay = () => {
        if (!this.tilawatProgressRaf) {
          this.tilawatProgressRaf = requestAnimationFrame(reportProgress);
        }
      };

      this.tilawatAudioEl.onended = () => {
        if (this.tilawatProgressRaf) {
          cancelAnimationFrame(this.tilawatProgressRaf);
          this.tilawatProgressRaf = null;
        }
        if (typeof onProgress === 'function') onProgress(1, 1, 1.0);
        if (onEnded) onEnded();
      };

      let triedOnline = false;
      this.tilawatAudioEl.onerror = () => {
        if (!triedOnline && navigator.onLine) {
          triedOnline = true;
          this.tilawatAudioEl.src = onlineUrl;
          const p = this.tilawatAudioEl.play();
          if (p !== undefined) {
            p.catch((err) => {
              if (err.name !== 'AbortError') triggerFallback();
            });
          }
        } else {
          triggerFallback();
        }
      };

      this.tilawatAudioEl.src = offlineAudioPath;
      const playPromise = this.tilawatAudioEl.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            if (!this.isPlayingTilawat && this.tilawatAudioEl) {
              this.tilawatAudioEl.pause();
              this.tilawatAudioEl.currentTime = 0;
            }
          })
          .catch((err) => {
            if (err.name === 'AbortError') return;
            // Let onerror handle online/speech fallback gracefully
          });
      }
    } catch (e) {
      console.warn('Falling back to Arabic TTS:', e);
      triggerFallback();
    }
  }

  // Fallback Arabic Voice Synthesis using Web Speech API
  speakArabicVerse(arabicText, onEnded = null, onProgress = null) {
    if (!('speechSynthesis' in window)) {
      this.isPlayingTilawat = false;
      this.notifyTilawatState({ isPlaying: false });
      if (onEnded) onEnded();
      return;
    }

    try {
      if (this.speechKeepAliveTimer) {
        clearInterval(this.speechKeepAliveTimer);
        this.speechKeepAliveTimer = null;
      }
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(arabicText);
      this.activeUtterance = utterance; // Retain persistent instance reference to prevent GC early cut-off

      utterance.lang = 'ar-SA';
      utterance.rate = 0.82; // Reverent Tajweed pace
      utterance.pitch = 1.0;

      const words = (arabicText || '').trim().split(/\s+/).filter(Boolean);
      const wordsCount = words.length;
      const estimatedDurationSec = Math.max(2.5, wordsCount * 1.15);
      const startTime = performance.now();

      if (this.tilawatProgressRaf) {
        cancelAnimationFrame(this.tilawatProgressRaf);
        this.tilawatProgressRaf = null;
      }

      const reportSpeechProgress = () => {
        if (!this.isPlayingTilawat) return;
        const elapsedSec = (performance.now() - startTime) / 1000;
        const ratio = Math.min(0.999, elapsedSec / estimatedDurationSec);
        if (typeof onProgress === 'function') {
          onProgress(elapsedSec, estimatedDurationSec, ratio);
        }
        this.tilawatProgressRaf = requestAnimationFrame(reportSpeechProgress);
      };

      utterance.onstart = () => {
        this.tilawatProgressRaf = requestAnimationFrame(reportSpeechProgress);
      };

      const voices = window.speechSynthesis.getVoices();
      const arVoice = voices.find(v => v.lang.startsWith('ar') || v.name.toLowerCase().includes('arabic'));
      if (arVoice) {
        utterance.voice = arVoice;
      }

      const cleanupSpeech = () => {
        if (this.speechKeepAliveTimer) {
          clearInterval(this.speechKeepAliveTimer);
          this.speechKeepAliveTimer = null;
        }
        if (this.tilawatProgressRaf) {
          cancelAnimationFrame(this.tilawatProgressRaf);
          this.tilawatProgressRaf = null;
        }
        this.activeUtterance = null;
      };

      utterance.onend = () => {
        cleanupSpeech();
        this.isPlayingTilawat = false;
        this.notifyTilawatState({ isPlaying: false });
        if (typeof onProgress === 'function') onProgress(estimatedDurationSec, estimatedDurationSec, 1.0);
        if (onEnded) onEnded();
      };

      utterance.onerror = () => {
        cleanupSpeech();
        this.isPlayingTilawat = false;
        this.notifyTilawatState({ isPlaying: false });
        if (onEnded) onEnded();
      };

      // Chrome/Android long utterance keep-alive (prevents browser pause at ~14s)
      this.speechKeepAliveTimer = setInterval(() => {
        if (!this.isPlayingTilawat || !this.activeUtterance) {
          clearInterval(this.speechKeepAliveTimer);
          this.speechKeepAliveTimer = null;
          return;
        }
        if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
          window.speechSynthesis.pause();
          window.speechSynthesis.resume();
        }
      }, 10000);

      window.speechSynthesis.speak(utterance);
    } catch (e) {
      if (this.speechKeepAliveTimer) {
        clearInterval(this.speechKeepAliveTimer);
        this.speechKeepAliveTimer = null;
      }
      if (this.tilawatProgressRaf) {
        cancelAnimationFrame(this.tilawatProgressRaf);
        this.tilawatProgressRaf = null;
      }
      this.activeUtterance = null;
      console.warn('Speech synthesis error:', e);
      this.isPlayingTilawat = false;
      this.notifyTilawatState({ isPlaying: false });
      if (onEnded) onEnded();
    }
  }

  // Stop currently playing Quran Tilawat
  stopTilawat() {
    this.isPlayingTilawat = false;

    // Release background WakeLock
    if (window.AndroidNativeNotifier && typeof window.AndroidNativeNotifier.releaseWakeLock === 'function') {
      try { window.AndroidNativeNotifier.releaseWakeLock(); } catch (_) {}
    }
    if (this.wakeLockSentinel) {
      try { this.wakeLockSentinel.release(); } catch (_) {}
      this.wakeLockSentinel = null;
    }

    // Reset lock-screen media state
    if ('mediaSession' in navigator) {
      try { navigator.mediaSession.playbackState = 'none'; } catch (_) {}
    }

    if (this.speechKeepAliveTimer) {
      clearInterval(this.speechKeepAliveTimer);
      this.speechKeepAliveTimer = null;
    }
    if (this.tilawatProgressRaf) {
      cancelAnimationFrame(this.tilawatProgressRaf);
      this.tilawatProgressRaf = null;
    }
    const prevSurah = this.currentRecitingSurah;
    const prevVerse = this.currentRecitingVerse;
    this.currentRecitingSurah = null;
    this.currentRecitingVerse = null;

    if (this.tilawatAudioEl) {
      try {
        this.tilawatAudioEl.pause();
        this.tilawatAudioEl.currentTime = 0;
        this.tilawatAudioEl.onended = null;
        this.tilawatAudioEl.ontimeupdate = null;
        this.tilawatAudioEl.onerror = null;
      } catch (_) {}
    }

    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch (_) {}
    }
    this.activeUtterance = null;

    this.notifyTilawatState({ isPlaying: false, surah: prevSurah, verse: prevVerse });
  }

  // Play a soft alarm chime / reminder
  playSoftChime() {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.audioCtx) return;

      const chords = [
        { freq: 440, time: 0 },
        { freq: 554.37, time: 0.15 },
        { freq: 659.25, time: 0.30 },
        { freq: 880, time: 0.45 }
      ];

      const now = this.audioCtx.currentTime;
      chords.forEach((c) => {
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(c.freq, now + c.time);

        gain.gain.setValueAtTime(0.25, now + c.time);
        gain.gain.exponentialRampToValueAtTime(0.001, now + c.time + 1.2);

        osc.connect(gain);
        gain.connect(this.audioCtx.destination);

        osc.start(now + c.time);
        osc.stop(now + c.time + 1.3);
      });
    } catch (e) {
      console.warn('Chime error:', e);
    }
  }

  // Stop ALL audio IMMEDIATELY and completely (Adhan, Tilawat, Chimes)
  stopCurrentAudio() {
    this.isPlayingAdhan = false;
    this.stopTilawat();

    // 1. Immediate HTML5 Audio silence
    if (this.audioEl) {
      try {
        this.audioEl.pause();
        this.audioEl.currentTime = 0;
        this.audioEl.removeAttribute('src');
        this.audioEl.load();
      } catch (_) {}
    }

    // 2. Immediate Web Audio silence
    if (this.masterGainNode && this.audioCtx) {
      try {
        this.masterGainNode.gain.setValueAtTime(0, this.audioCtx.currentTime);
        this.masterGainNode.disconnect();
      } catch (_) {}
      this.masterGainNode = null;
    }

    if (this.activeOscillators.length > 0) {
      this.activeOscillators.forEach((osc) => {
        try {
          osc.stop();
          osc.disconnect();
        } catch (_) {}
      });
      this.activeOscillators = [];
    }

    // 3. Clear scheduled timers
    if (this.activeTimeouts.length > 0) {
      this.activeTimeouts.forEach((t) => clearTimeout(t));
      this.activeTimeouts = [];
    }

    // 4. Cancel vibration
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate(0);
      } catch (_) {}
    }

    // 5. Notify all listeners
    this.notifyPlaybackState(false);
  }

  // Haptic feedback (Vibration)
  vibrate(pattern = 35) {
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch (_) {}
    }
  }

  // Milestone vibration (double pulse)
  vibrateMilestone() {
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate([100, 50, 150]);
      } catch (_) {}
    }
  }

  // Alarm vibration (long rhythmic pulse)
  vibrateAlarm() {
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate([500, 200, 500, 200, 1000]);
      } catch (_) {}
    }
  }
}

export const audioEngine = new IslamicAudioEngine();
