// Kalas Random Chess - Sound Effects
// Uses Web Audio API to generate sounds without external files

class SoundManager {
    constructor() {
        this.enabled = true;
        this.audioContext = null;
        this.initialized = false;
    }

    // Initialize audio context (must be called after user interaction)
    init() {
        if (this.initialized) return;

        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.initialized = true;
        } catch (e) {
            console.log('Web Audio API not supported');
            this.enabled = false;
        }
    }

    // Toggle sound on/off
    toggle() {
        this.enabled = !this.enabled;
        return this.enabled;
    }

    // Play a tone with given parameters
    playTone(frequency, duration, type = 'sine', volume = 0.3) {
        if (!this.enabled || !this.audioContext) return;

        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        oscillator.frequency.value = frequency;
        oscillator.type = type;

        gainNode.gain.setValueAtTime(volume, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);

        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + duration);
    }

    // Play noise burst (for captures)
    playNoise(duration, volume = 0.2) {
        if (!this.enabled || !this.audioContext) return;

        const bufferSize = this.audioContext.sampleRate * duration;
        const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
        const output = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1;
        }

        const noise = this.audioContext.createBufferSource();
        const gainNode = this.audioContext.createGain();
        const filter = this.audioContext.createBiquadFilter();

        noise.buffer = buffer;
        filter.type = 'lowpass';
        filter.frequency.value = 1000;

        noise.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        gainNode.gain.setValueAtTime(volume, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);

        noise.start();
    }

    // Sound: Regular move
    move() {
        this.init();
        this.playTone(400, 0.1, 'sine', 0.2);
        setTimeout(() => this.playTone(500, 0.08, 'sine', 0.15), 50);
    }

    // Sound: Capture
    capture() {
        this.init();
        this.playNoise(0.15, 0.25);
        this.playTone(300, 0.15, 'square', 0.2);
    }

    // Sound: Check
    check() {
        this.init();
        this.playTone(880, 0.1, 'square', 0.25);
        setTimeout(() => this.playTone(660, 0.15, 'square', 0.2), 100);
    }

    // Sound: Checkmate / Game over
    gameOver() {
        this.init();
        // Descending dramatic tones
        this.playTone(440, 0.2, 'sawtooth', 0.2);
        setTimeout(() => this.playTone(350, 0.2, 'sawtooth', 0.2), 200);
        setTimeout(() => this.playTone(280, 0.3, 'sawtooth', 0.25), 400);
    }

    // Sound: Victory
    victory() {
        this.init();
        // Ascending triumphant tones
        this.playTone(523, 0.15, 'sine', 0.25); // C5
        setTimeout(() => this.playTone(659, 0.15, 'sine', 0.25), 150); // E5
        setTimeout(() => this.playTone(784, 0.15, 'sine', 0.25), 300); // G5
        setTimeout(() => this.playTone(1047, 0.3, 'sine', 0.3), 450); // C6
    }

    // Sound: Invalid move / Error
    invalid() {
        this.init();
        this.playTone(200, 0.15, 'square', 0.2);
    }

    // Sound: Game start
    gameStart() {
        this.init();
        this.playTone(440, 0.1, 'sine', 0.2);
        setTimeout(() => this.playTone(550, 0.1, 'sine', 0.2), 100);
        setTimeout(() => this.playTone(660, 0.15, 'sine', 0.25), 200);
    }

    // Sound: Low time warning (under 30 seconds)
    lowTime() {
        this.init();
        this.playTone(800, 0.08, 'sine', 0.15);
    }

    // Sound: Time tick (last 10 seconds)
    tick() {
        this.init();
        this.playTone(1000, 0.05, 'sine', 0.1);
    }

    // Sound: Timeout (flag fall)
    timeout() {
        this.init();
        this.playTone(150, 0.3, 'sawtooth', 0.3);
        setTimeout(() => this.playTone(100, 0.4, 'sawtooth', 0.25), 200);
    }

    // Sound: Opponent joined
    opponentJoined() {
        this.init();
        this.playTone(600, 0.1, 'sine', 0.2);
        setTimeout(() => this.playTone(800, 0.15, 'sine', 0.25), 100);
    }

    // Sound: Select piece
    select() {
        this.init();
        this.playTone(600, 0.05, 'sine', 0.1);
    }
}

// Global sound manager instance
const Sounds = new SoundManager();
