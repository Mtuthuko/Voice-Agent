/**
 * AudioVisualizer - Renders real-time audio waveform on a canvas.
 */
class AudioVisualizer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.analyser = null;
        this.dataArray = null;
        this.animationId = null;
        this.isActive = false;

        // Style
        this.barColor = '#6c63ff';
        this.barColorSpeaking = '#fbbf24';
        this.isSpeaking = false;

        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width = rect.width * window.devicePixelRatio;
        this.canvas.height = rect.height * window.devicePixelRatio;
        this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
        this.displayWidth = rect.width;
        this.displayHeight = rect.height;
    }

    connect(analyserNode) {
        this.analyser = analyserNode;
        this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    }

    start() {
        if (this.isActive) return;
        this.isActive = true;
        this.draw();
    }

    stop() {
        this.isActive = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        this.clearCanvas();
    }

    setSpeaking(isSpeaking) {
        this.isSpeaking = isSpeaking;
    }

    draw() {
        if (!this.isActive) return;
        this.animationId = requestAnimationFrame(() => this.draw());

        if (!this.analyser) {
            this.clearCanvas();
            return;
        }

        this.analyser.getByteFrequencyData(this.dataArray);

        const width = this.displayWidth;
        const height = this.displayHeight;

        this.ctx.clearRect(0, 0, width, height);

        // Draw bars from center
        const barCount = 64;
        const barWidth = (width / barCount) * 0.7;
        const gap = (width / barCount) * 0.3;
        const centerY = height / 2;

        const color = this.isSpeaking ? this.barColorSpeaking : this.barColor;

        for (let i = 0; i < barCount; i++) {
            const dataIndex = Math.floor((i / barCount) * this.dataArray.length);
            const value = this.dataArray[dataIndex] / 255;
            const barHeight = value * (height * 0.8);

            const x = i * (barWidth + gap) + gap / 2;

            // Gradient opacity based on value
            const alpha = 0.3 + value * 0.7;

            this.ctx.fillStyle = this.hexToRGBA(color, alpha);
            this.ctx.beginPath();
            this.ctx.roundRect(
                x,
                centerY - barHeight / 2,
                barWidth,
                barHeight || 2,
                barWidth / 2
            );
            this.ctx.fill();
        }
    }

    clearCanvas() {
        this.ctx.clearRect(0, 0, this.displayWidth, this.displayHeight);

        // Draw idle line
        const centerY = this.displayHeight / 2;
        this.ctx.strokeStyle = 'rgba(108, 99, 255, 0.2)';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(0, centerY);
        this.ctx.lineTo(this.displayWidth, centerY);
        this.ctx.stroke();
    }

    hexToRGBA(hex, alpha) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    destroy() {
        this.stop();
    }
}

window.AudioVisualizer = AudioVisualizer;
