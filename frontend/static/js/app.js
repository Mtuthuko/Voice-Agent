/**
 * Voice Agent - Main Application Controller
 *
 * Orchestrates WebSocket communication, audio I/O, and UI updates.
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
        entry.innerHTML = `<span class="tool-name">${name}</span>: ${args}`;
        toolCallsLog.appendChild(entry);
        toolCallsLog.scrollTop = toolCallsLog.scrollHeight;
    }

    // --- WebSocket Connection ---
    async function connect() {
        const provider = providerSelect.value;
        const voice = voiceSelect.value;
        const toolsEnabled = toolsToggle.checked;

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/voice`;

        setStatus('', 'Connecting...');
        connectBtn.disabled = true;

        try {
            ws = new WebSocket(wsUrl);

            ws.onopen = () => {
                // Send session configuration
                ws.send(JSON.stringify({
                    provider: provider,
                    voice: voice,
                    tools_enabled: toolsEnabled,
                    turn_detection: true,
                }));
                providerBadge.textContent = provider;
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
                    if (!audioProcessor) initAudioProcessor();
                    audioProcessor.playAudio(data.audio);
                }
                break;

            case 'audio.done':
                setStatus('connected', 'Listening...');
                setAvatar('active');
                visualizer.setSpeaking(false);
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
                    addTranscript('user', data.text);
                } else if (data.role === 'assistant' && data.text) {
                    if (!currentTranscriptEl) {
                        addTranscript('assistant', data.text);
                    }
                    currentTranscriptEl = null;
                }
                break;

            case 'speech.started':
                // User started speaking - interrupt playback
                setStatus('listening', 'Listening...');
                setAvatar('active');
                visualizer.setSpeaking(false);
                if (audioProcessor) {
                    audioProcessor.stopPlayback();
                }
                currentTranscriptEl = null;
                break;

            case 'speech.stopped':
                setStatus('connected', 'Processing...');
                break;

            case 'response.done':
                setStatus('connected', 'Listening...');
                setAvatar('active');
                visualizer.setSpeaking(false);
                currentTranscriptEl = null;
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

    function handleDisconnect() {
        isConnected = false;
        ws = null;

        setStatus('', 'Disconnected');
        setAvatar('');
        connectBtn.disabled = false;
        disconnectBtn.disabled = true;
        micBtn.disabled = true;

        if (isMicActive) toggleMic();

        visualizer.stop();
        if (audioProcessor) {
            audioProcessor.destroy();
            audioProcessor = null;
        }
    }

    function disconnect() {
        if (ws) {
            ws.send(JSON.stringify({ type: 'session.end' }));
            ws.close();
        }
        handleDisconnect();
    }

    // --- Audio ---
    async function initAudioProcessor() {
        audioProcessor = new AudioProcessor();
        await audioProcessor.initialize();

        audioProcessor.onAudioData = (pcm16Bytes) => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(pcm16Bytes.buffer);
            }
        };

        audioProcessor.onPlaybackStateChange = (isPlaying) => {
            if (isPlaying) {
                visualizer.setSpeaking(true);
            } else {
                visualizer.setSpeaking(false);
            }
        };

        // Connect visualizer to audio analyser
        visualizer.connect(audioProcessor.getAnalyserNode());
        visualizer.start();
    }

    async function toggleMic() {
        if (!audioProcessor) {
            await initAudioProcessor();
        }

        if (isMicActive) {
            audioProcessor.stopCapture();
            isMicActive = false;
            micBtn.classList.remove('active');
            setStatus('connected', 'Mic off');
        } else {
            try {
                await audioProcessor.startCapture();
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

    // --- Text Input ---
    function sendText() {
        const text = textInput.value.trim();
        if (!text || !ws || !isConnected) return;

        ws.send(JSON.stringify({ type: 'text.send', text: text }));
        addTranscript('user', text);
        textInput.value = '';
    }

    // --- Event Listeners ---
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
            providerBadge.textContent = config.provider;
        })
        .catch(() => {});
})();
