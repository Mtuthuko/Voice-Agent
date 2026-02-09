/**
 * AudioProcessor - Handles microphone capture, playback, and PCM16 conversion.
 *
 * The OpenAI Realtime API expects/sends audio as base64-encoded PCM16 at 24kHz mono.
 * This module captures mic audio, resamples to 24kHz, and converts to PCM16 for sending.
 * For playback, it decodes incoming base64 PCM16 and plays through the AudioContext.
 */
class AudioProcessor {
    constructor() {
        this.audioContext = null;
        this.mediaStream = null;
        this.sourceNode = null;
        this.processorNode = null;
        this.analyserNode = null;
        this.isCapturing = false;

        // Playback
        this.playbackQueue = [];
        this.isPlaying = false;
        this.nextPlayTime = 0;

        // Config
        this.targetSampleRate = 24000; // OpenAI expects 24kHz
        this.bufferSize = 4096;

        // Callbacks
        this.onAudioData = null; // (pcm16Bytes) => void
        this.onPlaybackStateChange = null; // (isPlaying) => void
    }

    async initialize() {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
            sampleRate: this.targetSampleRate,
        });

        // Create analyser for visualization
        this.analyserNode = this.audioContext.createAnalyser();
        this.analyserNode.fftSize = 256;
        this.analyserNode.smoothingTimeConstant = 0.8;
    }

    async startCapture() {
        if (this.isCapturing) return;

        if (!this.audioContext) {
            await this.initialize();
        }

        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }

        this.mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                channelCount: 1,
                sampleRate: this.targetSampleRate,
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
            },
        });

        this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
        this.sourceNode.connect(this.analyserNode);

        // Use ScriptProcessorNode for PCM access (AudioWorklet alternative below)
        this.processorNode = this.audioContext.createScriptProcessor(
            this.bufferSize, 1, 1
        );

        this.processorNode.onaudioprocess = (event) => {
            if (!this.isCapturing) return;

            const inputData = event.inputBuffer.getChannelData(0);
            const pcm16 = this.float32ToPCM16(inputData);

            if (this.onAudioData) {
                this.onAudioData(pcm16);
            }
        };

        this.sourceNode.connect(this.processorNode);
        this.processorNode.connect(this.audioContext.destination);

        this.isCapturing = true;
    }

    stopCapture() {
        this.isCapturing = false;

        if (this.processorNode) {
            this.processorNode.disconnect();
            this.processorNode = null;
        }

        if (this.sourceNode) {
            this.sourceNode.disconnect();
            this.sourceNode = null;
        }

        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }
    }

    /**
     * Queue base64-encoded PCM16 audio for playback.
     */
    playAudio(base64Audio) {
        const pcm16 = this.base64ToPCM16(base64Audio);
        const float32 = this.pcm16ToFloat32(pcm16);

        const buffer = this.audioContext.createBuffer(
            1, float32.length, this.targetSampleRate
        );
        buffer.getChannelData(0).set(float32);

        const source = this.audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(this.analyserNode);
        this.analyserNode.connect(this.audioContext.destination);

        const currentTime = this.audioContext.currentTime;
        const startTime = Math.max(currentTime, this.nextPlayTime);

        source.start(startTime);
        this.nextPlayTime = startTime + buffer.duration;

        if (!this.isPlaying) {
            this.isPlaying = true;
            if (this.onPlaybackStateChange) {
                this.onPlaybackStateChange(true);
            }
        }

        source.onended = () => {
            if (this.audioContext.currentTime >= this.nextPlayTime - 0.05) {
                this.isPlaying = false;
                if (this.onPlaybackStateChange) {
                    this.onPlaybackStateChange(false);
                }
            }
        };
    }

    stopPlayback() {
        this.nextPlayTime = 0;
        this.isPlaying = false;
        if (this.onPlaybackStateChange) {
            this.onPlaybackStateChange(false);
        }
    }

    getAnalyserNode() {
        return this.analyserNode;
    }

    // --- Conversion Utilities ---

    float32ToPCM16(float32Array) {
        const buffer = new ArrayBuffer(float32Array.length * 2);
        const view = new DataView(buffer);
        for (let i = 0; i < float32Array.length; i++) {
            const s = Math.max(-1, Math.min(1, float32Array[i]));
            view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        }
        return new Uint8Array(buffer);
    }

    pcm16ToFloat32(pcm16Array) {
        const float32 = new Float32Array(pcm16Array.length / 2);
        const view = new DataView(pcm16Array.buffer);
        for (let i = 0; i < float32.length; i++) {
            const int16 = view.getInt16(i * 2, true);
            float32[i] = int16 / 0x8000;
        }
        return float32;
    }

    base64ToPCM16(base64) {
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
    }

    destroy() {
        this.stopCapture();
        this.stopPlayback();
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
    }
}

window.AudioProcessor = AudioProcessor;
