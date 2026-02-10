/**
 * Voice Agent - Main Application Controller
 *
 * Supports two modes:
 * - "pipeline" (GitHub Models): Browser STT (Web Speech API) → LLM → Edge-TTS (MP3)
 * - "realtime" (OpenAI/ElevenLabs): Raw PCM16 audio streaming via WebSocket
 */
(function () {
    // --- DOM Elements ---
    const statusIndicator = document.getElementById('statusIndicator');
    const statusText = document.getElementById('statusText');
    const providerBadge = document.getElementById('providerBadge');
    const avatarRing = document.getElementById('avatarRing');
    const transcriptContainer = document.getElementById('transcriptContainer');
    const transcriptPlaceholder = document.getElementById('transcriptPlaceholder');
    const toolsSection = document.getElementById('toolsSection');
    const toolCallsLog = document.getElementById('toolCallsLog');
    const textInput = document.getElementById('textInput');
    const sendTextBtn = document.getElementById('sendTextBtn');
    const connectBtn = document.getElementById('connectBtn');
    const micBtn = document.getElementById('micBtn');
    const disconnectBtn = document.getElementById('disconnectBtn');
    const providerSelect = document.getElementById('providerSelect');
    const voiceSelect = document.getElementById('voiceSelect');
    const toolsToggle = document.getElementById('toolsToggle');

    // --- State ---
    let ws = null;
    let audioProcessor = null;
    let visualizer = null;
    let isConnected = false;
    let isMicActive = false;
    let currentTranscriptEl = null;
    let currentMode = 'pipeline'; // 'pipeline' or 'realtime'

    // --- Pipeline mode: Speech Recognition ---
    let recognition = null;
    let mp3Player = null; // HTMLAudioElement for playing MP3 chunks

    // --- Initialize Visualizer ---
    visualizer = new AudioVisualizer('visualizer');
    visualizer.clearCanvas();

    // --- Status Helpers ---
    function setStatus(state, text) {
        statusIndicator.className = 'status-indicator ' + state;
        statusText.textContent = text;
    }

    function setAvatar(state) {
        avatarRing.className = 'avatar-ring ' + state;
    }

    // --- Mode Detection ---
    function isPipelineMode() {
        return providerSelect.value === 'github';
    }

    // --- Transcript ---
    function addTranscript(role, text) {
        if (transcriptPlaceholder) {
            transcriptPlaceholder.style.display = 'none';
        }

        const msg = document.createElement('div');
        msg.className = `transcript-msg ${role}`;

        const label = document.createElement('div');
        label.className = 'role-label';
        label.textContent = role === 'user' ? 'You' : 'Atlas';
        msg.appendChild(label);

        const content = document.createElement('div');
        content.textContent = text;
        msg.appendChild(content);

        transcriptContainer.appendChild(msg);
        transcriptContainer.scrollTop = transcriptContainer.scrollHeight;

        return msg;
    }

    function updateCurrentTranscript(text) {
        if (currentTranscriptEl) {
            const content = currentTranscriptEl.querySelector('div:last-child');
            if (content) {
                content.textContent += text;
                transcriptContainer.scrollTop = transcriptContainer.scrollHeight;
            }
        }
    }

    function addToolCall(name, args) {
        toolsSection.style.display = 'block';
        const entry = document.createElement('div');
        entry.className = 'tool-call-entry';
        entry.innerHTML = `<span class="tool-name">${escapeHtml(name)}</span>: ${escapeHtml(args)}`;
        toolCallsLog.appendChild(entry);
        toolCallsLog.scrollTop = toolCallsLog.scrollHeight;
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // =========================================================================
    // WebSocket Connection
    // =========================================================================
    async function connect() {
        const provider = providerSelect.value;
        const voice = voiceSelect.value;
        const toolsEnabled = toolsToggle.checked;

        currentMode = (provider === 'github') ? 'pipeline' : 'realtime';

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/voice`;

        setStatus('', 'Connecting...');
        connectBtn.disabled = true;

        try {
            ws = new WebSocket(wsUrl);

            ws.onopen = () => {
                ws.send(JSON.stringify({
                    provider: provider,
                    voice: voice,
                    tools_enabled: toolsEnabled,
                    turn_detection: provider !== 'github', // pipeline uses client-side STT
                }));
                providerBadge.textContent = provider === 'github' ? 'GitHub Models' : provider;
            };

            ws.onmessage = (event) => {
                const message = JSON.parse(event.data);
                handleServerEvent(message);
            };

            ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                setStatus('error', 'Connection error');
            };

            ws.onclose = () => {
                handleDisconnect();
            };
        } catch (err) {
            console.error('Connection failed:', err);
            setStatus('error', 'Failed to connect');
            connectBtn.disabled = false;
        }
    }

    // =========================================================================
    // Server Event Handler
    // =========================================================================
    function handleServerEvent(message) {
        const { type, data } = message;

        switch (type) {
            case 'session.started':
                isConnected = true;
                setStatus('connected', 'Connected');
                setAvatar('active');
                connectBtn.disabled = true;
                disconnectBtn.disabled = false;
                micBtn.disabled = false;
                break;

            case 'session.created':
                setStatus('connected', 'Session ready');
                break;

            case 'audio.delta':
                if (data.audio) {
                    if (data.format === 'mp3') {
                        playMp3Chunk(data.audio);
                    } else {
                        // PCM16 for realtime providers
                        if (!audioProcessor) initAudioProcessor();
                        audioProcessor.playAudio(data.audio);
                    }
                    setStatus('speaking', 'Speaking...');
                    setAvatar('speaking');
                    visualizer.setSpeaking(true);
                }
                break;

            case 'audio.done':
                // Small delay to let last audio chunk finish playing
                setTimeout(() => {
                    setStatus('connected', isPipelineMode() ? 'Ready' : 'Listening...');
                    setAvatar('active');
                    visualizer.setSpeaking(false);
                }, 500);
                break;

            case 'transcript.delta':
                if (data.role === 'assistant') {
                    if (!currentTranscriptEl) {
                        currentTranscriptEl = addTranscript('assistant', '');
                    }
                    updateCurrentTranscript(data.text);
                    setStatus('speaking', 'Speaking...');
                    setAvatar('speaking');
                    visualizer.setSpeaking(true);
                }
                break;

            case 'transcript.done':
                if (data.role === 'user' && data.text) {
                    // In pipeline mode, we already added the transcript client-side
                    if (!isPipelineMode()) {
                        addTranscript('user', data.text);
                    }
                } else if (data.role === 'assistant' && data.text) {
                    if (!currentTranscriptEl) {
                        addTranscript('assistant', data.text);
                    }
                    currentTranscriptEl = null;
                }
                break;

            case 'speech.started':
                setStatus('listening', 'Listening...');
                setAvatar('active');
                visualizer.setSpeaking(false);
                if (audioProcessor) audioProcessor.stopPlayback();
                stopMp3Playback();
                currentTranscriptEl = null;
                break;

            case 'speech.stopped':
                setStatus('connected', 'Processing...');
                break;

            case 'response.done':
                setTimeout(() => {
                    setStatus('connected', isPipelineMode() ? 'Ready' : 'Listening...');
                    setAvatar('active');
                    visualizer.setSpeaking(false);
                    currentTranscriptEl = null;
                }, 300);
                break;

            case 'tool.calling':
                addToolCall(data.name, data.arguments || '');
                setStatus('connected', `Using ${data.name}...`);
                break;

            case 'tool.result':
                addToolCall(data.name + ' result', data.result?.substring(0, 100) || '');
                break;

            case 'error':
                console.error('Server error:', data.message);
                setStatus('error', data.message || 'Error occurred');
                break;

            case 'session.ended':
                handleDisconnect();
                break;
        }
    }

    // =========================================================================
    // Disconnect
    // =========================================================================
    function handleDisconnect() {
        isConnected = false;
        ws = null;

        setStatus('', 'Disconnected');
        setAvatar('');
        connectBtn.disabled = false;
        disconnectBtn.disabled = true;
        micBtn.disabled = true;

        if (isMicActive) toggleMic();
        stopSpeechRecognition();

        visualizer.stop();
        if (audioProcessor) {
            audioProcessor.destroy();
            audioProcessor = null;
        }
        stopMp3Playback();
    }

    function disconnect() {
        if (ws) {
            ws.send(JSON.stringify({ type: 'session.end' }));
            ws.close();
        }
        handleDisconnect();
    }

    // =========================================================================
    // Pipeline Mode: MP3 Playback (Edge-TTS sends MP3 chunks)
    // =========================================================================
    let mp3Chunks = [];
    let mp3Playing = false;

    function playMp3Chunk(base64Audio) {
        mp3Chunks.push(base64Audio);
        if (!mp3Playing) {
            mp3Playing = true;
            playNextMp3();
        }
    }

    function playNextMp3() {
        if (mp3Chunks.length === 0) {
            mp3Playing = false;
            return;
        }

        // Collect all available chunks into one blob for smoother playback
        const allChunks = mp3Chunks.splice(0, mp3Chunks.length);
        const binaryParts = allChunks.map(b64 => {
            const binary = atob(b64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            return bytes;
        });

        const blob = new Blob(binaryParts, { type: 'audio/mpeg' });
        const url = URL.createObjectURL(blob);

        if (mp3Player) {
            mp3Player.pause();
            mp3Player = null;
        }

        mp3Player = new Audio(url);

        // Connect to visualizer via AudioContext for waveform display
        try {
            if (!audioProcessor) {
                const tempProcessor = new AudioProcessor();
                tempProcessor.initialize().then(() => {
                    audioProcessor = tempProcessor;
                    connectMp3ToVisualizer();
                });
            } else {
                connectMp3ToVisualizer();
            }
        } catch (e) {
            // Visualization not critical
        }

        mp3Player.onended = () => {
            URL.revokeObjectURL(url);
            if (mp3Chunks.length > 0) {
                playNextMp3();
            } else {
                mp3Playing = false;
            }
        };

        mp3Player.onerror = () => {
            URL.revokeObjectURL(url);
            mp3Playing = false;
        };

        mp3Player.play().catch(() => { mp3Playing = false; });
    }

    function connectMp3ToVisualizer() {
        if (!audioProcessor || !mp3Player) return;
        try {
            const ctx = audioProcessor.audioContext;
            if (ctx && ctx.state !== 'closed') {
                const source = ctx.createMediaElementSource(mp3Player);
                const analyser = audioProcessor.getAnalyserNode();
                source.connect(analyser);
                analyser.connect(ctx.destination);
                visualizer.connect(analyser);
                visualizer.start();
            }
        } catch (e) {
            // MediaElementSource can only be created once per element - ignore
        }
    }

    function stopMp3Playback() {
        mp3Chunks = [];
        mp3Playing = false;
        if (mp3Player) {
            mp3Player.pause();
            mp3Player = null;
        }
    }

    // =========================================================================
    // Pipeline Mode: Web Speech API (STT)
    // =========================================================================
    function startSpeechRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            setStatus('error', 'Speech recognition not supported in this browser');
            return;
        }

        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        let finalTranscript = '';
        let silenceTimer = null;

        recognition.onresult = (event) => {
            let interim = '';
            finalTranscript = '';

            for (let i = 0; i < event.results.length; i++) {
                const result = event.results[i];
                if (result.isFinal) {
                    finalTranscript += result[0].transcript;
                } else {
                    interim += result[0].transcript;
                }
            }

            // Show interim results in status
            if (interim) {
                setStatus('listening', `Hearing: "${interim.slice(-50)}"`);
            }

            // When we get a final result, send it after a short pause
            if (finalTranscript) {
                clearTimeout(silenceTimer);
                silenceTimer = setTimeout(() => {
                    if (finalTranscript.trim() && ws && isConnected) {
                        const text = finalTranscript.trim();
                        addTranscript('user', text);
                        ws.send(JSON.stringify({ type: 'text.send', text: text }));
                        setStatus('connected', 'Processing...');
                        finalTranscript = '';
                    }
                }, 800);
            }
        };

        recognition.onend = () => {
            // Auto-restart if mic is still active
            if (isMicActive && isConnected) {
                try {
                    recognition.start();
                } catch (e) {
                    // Already started
                }
            }
        };

        recognition.onerror = (event) => {
            if (event.error === 'no-speech') return; // Normal timeout
            console.error('Speech recognition error:', event.error);
            if (event.error === 'not-allowed') {
                setStatus('error', 'Microphone permission denied');
                isMicActive = false;
                micBtn.classList.remove('active');
            }
        };

        recognition.start();
    }

    function stopSpeechRecognition() {
        if (recognition) {
            try { recognition.stop(); } catch (e) {}
            recognition = null;
        }
    }

    // =========================================================================
    // Realtime Mode: PCM Audio Streaming
    // =========================================================================
    async function initAudioProcessor() {
        audioProcessor = new AudioProcessor();
        await audioProcessor.initialize();

        audioProcessor.onAudioData = (pcm16Bytes) => {
            if (ws && ws.readyState === WebSocket.OPEN && !isPipelineMode()) {
                ws.send(pcm16Bytes.buffer);
            }
        };

        audioProcessor.onPlaybackStateChange = (isPlaying) => {
            visualizer.setSpeaking(isPlaying);
        };

        visualizer.connect(audioProcessor.getAnalyserNode());
        visualizer.start();
    }

    // =========================================================================
    // Mic Toggle (mode-aware)
    // =========================================================================
    async function toggleMic() {
        if (isMicActive) {
            // Stop
            if (isPipelineMode()) {
                stopSpeechRecognition();
            } else {
                if (audioProcessor) audioProcessor.stopCapture();
            }
            isMicActive = false;
            micBtn.classList.remove('active');
            setStatus('connected', 'Mic off');
        } else {
            // Start
            try {
                if (isPipelineMode()) {
                    startSpeechRecognition();
                } else {
                    if (!audioProcessor) await initAudioProcessor();
                    await audioProcessor.startCapture();
                }
                isMicActive = true;
                micBtn.classList.add('active');
                setStatus('listening', 'Listening...');
                setAvatar('active');
            } catch (err) {
                console.error('Mic error:', err);
                setStatus('error', 'Microphone access denied');
            }
        }
    }

    // =========================================================================
    // Text Input
    // =========================================================================
    function sendText() {
        const text = textInput.value.trim();
        if (!text || !ws || !isConnected) return;

        ws.send(JSON.stringify({ type: 'text.send', text: text }));
        addTranscript('user', text);
        textInput.value = '';
        setStatus('connected', 'Processing...');
    }

    // =========================================================================
    // Event Listeners
    // =========================================================================
    connectBtn.addEventListener('click', connect);
    disconnectBtn.addEventListener('click', disconnect);
    micBtn.addEventListener('click', toggleMic);
    sendTextBtn.addEventListener('click', sendText);

    textInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') sendText();
    });

    // Fetch initial config
    fetch('/api/config')
        .then(r => r.json())
        .then(config => {
            providerSelect.value = config.provider;
            if (config.voice) voiceSelect.value = config.voice;
            currentMode = config.mode || 'pipeline';
            providerBadge.textContent = config.provider === 'github' ? 'GitHub Models' : config.provider;
        })
        .catch(() => {});
})();
