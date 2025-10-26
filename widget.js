(function() {
    'use strict';
    
    // Configuration - Update these values for your deployment
    const WS_URL = 'ws://localhost:8765'; // Your WebSocket server URL
    
    // Get the script tag that loaded this widget
    const currentScript = document.currentScript || document.querySelector('script[data-agent-id]');
    const AGENT_ID = currentScript ? currentScript.getAttribute('data-agent-id') : null;
    
    // Widget state
    let ws = null;
    let audioContext = null;
    let mediaStream = null;
    let audioWorkletNode = null;
    let isConnected = false;
    let audioQueue = [];
    let isPlaying = false;
    let currentAssistantTranscript = '';
    let currentAudioSource = null;
    let currentUserTranscript = '';
    let lastUserMessageDiv = null;
    let isWidgetOpen = false;
    let visualizerInterval = null;

    // Create widget container
    const widgetContainer = document.createElement('div');
    widgetContainer.id = 'ai-voice-widget';
    widgetContainer.innerHTML = `
        <style>
            #ai-voice-widget * {
                box-sizing: border-box;
                margin: 0;
                padding: 0;
            }
            
            #ai-voice-widget {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                position: fixed;
                bottom: 24px;
                right: 24px;
                z-index: 999999;
            }
            
            /* Toggle Button */
            .ai-widget-button {
                width: 64px;
                height: 64px;
                border-radius: 50%;
                background: linear-gradient(135deg, #2d3748 0%, #1a202c 100%);
                border: none;
                cursor: pointer;
                box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15), 0 2px 4px rgba(0, 0, 0, 0.1);
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                position: relative;
            }
            
            .ai-widget-button::before {
                content: '';
                position: absolute;
                inset: -2px;
                border-radius: 50%;
                padding: 2px;
                background: linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0));
                -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
                -webkit-mask-composite: xor;
                mask-composite: exclude;
                opacity: 0;
                transition: opacity 0.3s;
            }
            
            .ai-widget-button:hover {
                transform: translateY(-2px);
                box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2), 0 4px 8px rgba(0, 0, 0, 0.1);
            }
            
            .ai-widget-button:hover::before {
                opacity: 1;
            }
            
            .ai-widget-button:active {
                transform: translateY(0);
            }
            
            .ai-widget-button svg {
                width: 28px;
                height: 28px;
                fill: white;
                transition: transform 0.3s;
            }
            
            .ai-widget-button:hover svg {
                transform: scale(1.1);
            }
            
            .ai-widget-button.active {
                background: linear-gradient(135deg, #48bb78 0%, #38a169 100%);
            }
            
            .ai-widget-button.recording {
                animation: ai-pulse 2s ease-in-out infinite;
            }
            
            @keyframes ai-pulse {
                0%, 100% {
                    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15), 0 0 0 0 rgba(72, 187, 120, 0.7);
                }
                50% {
                    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15), 0 0 0 14px rgba(72, 187, 120, 0);
                }
            }
            
            /* Widget Panel */
            .ai-widget-panel {
                position: absolute;
                bottom: 80px;
                right: 0;
                width: 400px;
                max-width: calc(100vw - 48px);
                max-height: 640px;
                background: #ffffff;
                border-radius: 20px;
                box-shadow: 0 12px 48px rgba(0, 0, 0, 0.15), 0 4px 12px rgba(0, 0, 0, 0.1);
                display: none;
                flex-direction: column;
                overflow: hidden;
                animation: ai-slideUp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
                border: 1px solid rgba(0, 0, 0, 0.05);
            }
            
            .ai-widget-panel.open {
                display: flex;
            }
            
            @keyframes ai-slideUp {
                from {
                    opacity: 0;
                    transform: translateY(30px) scale(0.95);
                }
                to {
                    opacity: 1;
                    transform: translateY(0) scale(1);
                }
            }
            
            /* Header */
            .ai-widget-header {
                background: linear-gradient(135deg, #2d3748 0%, #1a202c 100%);
                color: white;
                padding: 24px 24px 20px 24px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                position: relative;
            }
            
            .ai-widget-header::after {
                content: '';
                position: absolute;
                bottom: 0;
                left: 0;
                right: 0;
                height: 1px;
                background: linear-gradient(90deg, 
                    rgba(255,255,255,0) 0%, 
                    rgba(255,255,255,0.1) 50%, 
                    rgba(255,255,255,0) 100%);
            }
            
            .ai-widget-header h3 {
                font-size: 19px;
                font-weight: 600;
                margin: 0;
                letter-spacing: -0.3px;
            }
            
            .ai-widget-close {
                background: rgba(255, 255, 255, 0.1);
                border: none;
                color: white;
                cursor: pointer;
                padding: 8px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 8px;
                transition: all 0.2s;
            }
            
            .ai-widget-close:hover {
                background: rgba(255, 255, 255, 0.2);
                transform: rotate(90deg);
            }
            
            .ai-widget-close svg {
                width: 18px;
                height: 18px;
                fill: currentColor;
            }
            
            /* Status Bar */
            .ai-widget-status {
                padding: 14px 24px;
                text-align: center;
                font-size: 13px;
                font-weight: 600;
                border-bottom: 1px solid #e2e8f0;
                transition: all 0.3s ease;
                position: relative;
                overflow: hidden;
            }
            
            .ai-widget-status::before {
                content: '';
                position: absolute;
                left: 0;
                top: 0;
                bottom: 0;
                width: 3px;
                background: currentColor;
                opacity: 0;
                transition: opacity 0.3s;
            }
            
            .ai-widget-status.listening::before,
            .ai-widget-status.speaking::before {
                opacity: 0.3;
            }
            
            .ai-widget-status.disconnected {
                background: #f7fafc;
                color: #718096;
            }
            
            .ai-widget-status.connected {
                background: #f0fff4;
                color: #38a169;
            }
            
            .ai-widget-status.listening {
                background: #ebf8ff;
                color: #2c5282;
                animation: ai-pulse-subtle 2s infinite;
            }
            
            .ai-widget-status.speaking {
                background: #fffaf0;
                color: #c05621;
            }
            
            @keyframes ai-pulse-subtle {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.85; }
            }
            
            /* Visualizer */
            .ai-widget-visualizer {
                padding: 24px;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 5px;
                height: 100px;
                background: linear-gradient(180deg, #f7fafc 0%, #edf2f7 100%);
                position: relative;
            }
            
            .ai-widget-visualizer::before {
                content: '';
                position: absolute;
                inset: 0;
                background: radial-gradient(circle at center, rgba(45, 55, 72, 0.03) 0%, transparent 70%);
                pointer-events: none;
            }
            
            .ai-visualizer-bar {
                width: 5px;
                height: 18px;
                background: linear-gradient(180deg, #4a5568 0%, #2d3748 100%);
                border-radius: 3px;
                transition: height 0.15s cubic-bezier(0.4, 0, 0.2, 1);
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
            }
            
            /* Messages */
            .ai-widget-messages {
                flex: 1;
                overflow-y: auto;
                padding: 24px;
                display: flex;
                flex-direction: column;
                gap: 16px;
                background: #ffffff;
                min-height: 200px;
            }
            
            .ai-widget-messages::-webkit-scrollbar {
                width: 8px;
            }
            
            .ai-widget-messages::-webkit-scrollbar-track {
                background: transparent;
                margin: 8px 0;
            }
            
            .ai-widget-messages::-webkit-scrollbar-thumb {
                background: #cbd5e0;
                border-radius: 4px;
                border: 2px solid #ffffff;
            }
            
            .ai-widget-messages::-webkit-scrollbar-thumb:hover {
                background: #a0aec0;
            }
            
            .ai-message {
                padding: 14px 16px;
                border-radius: 16px;
                max-width: 85%;
                line-height: 1.5;
                font-size: 14px;
                animation: ai-messageIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
                word-wrap: break-word;
                position: relative;
            }
            
            @keyframes ai-messageIn {
                from {
                    opacity: 0;
                    transform: translateY(12px) scale(0.95);
                }
                to {
                    opacity: 1;
                    transform: translateY(0) scale(1);
                }
            }
            
            .ai-message.user {
                background: linear-gradient(135deg, #2d3748 0%, #1a202c 100%);
                color: white;
                align-self: flex-end;
                border-bottom-right-radius: 4px;
                box-shadow: 0 2px 8px rgba(45, 55, 72, 0.15);
            }
            
            .ai-message.assistant {
                background: #f7fafc;
                color: #2d3748;
                align-self: flex-start;
                border-bottom-left-radius: 4px;
                border: 1px solid #e2e8f0;
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
            }
            
            .ai-message-label {
                font-size: 10px;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.6px;
                margin-bottom: 6px;
                opacity: 0.7;
            }
            
            .ai-message.user .ai-message-label {
                opacity: 0.8;
            }
            
            .ai-empty-state {
                text-align: center;
                padding: 50px 20px;
                color: #a0aec0;
            }
            
            .ai-empty-icon {
                font-size: 48px;
                margin-bottom: 12px;
                animation: ai-wave 2s ease-in-out infinite;
            }
            
            @keyframes ai-wave {
                0%, 100% { transform: rotate(0deg); }
                10%, 30% { transform: rotate(14deg); }
                20% { transform: rotate(-8deg); }
                40%, 100% { transform: rotate(0deg); }
            }
            
            .ai-empty-text {
                font-size: 14px;
                font-weight: 500;
            }
            
            /* Controls */
            .ai-widget-controls {
                padding: 20px 24px;
                border-top: 1px solid #e2e8f0;
                background: #ffffff;
                display: flex;
                gap: 12px;
            }
            
            .ai-control-btn {
                flex: 1;
                padding: 14px 24px;
                border: none;
                border-radius: 10px;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                position: relative;
                overflow: hidden;
            }
            
            .ai-control-btn::before {
                content: '';
                position: absolute;
                top: 50%;
                left: 50%;
                width: 0;
                height: 0;
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.2);
                transform: translate(-50%, -50%);
                transition: width 0.6s, height 0.6s;
            }
            
            .ai-control-btn:active::before {
                width: 300px;
                height: 300px;
            }
            
            .ai-control-btn:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            }
            
            .ai-control-btn:active {
                transform: translateY(0);
            }
            
            .ai-control-btn.primary {
                background: linear-gradient(135deg, #2d3748 0%, #1a202c 100%);
                color: white;
                box-shadow: 0 2px 8px rgba(45, 55, 72, 0.2);
            }
            
            .ai-control-btn.primary:hover {
                background: linear-gradient(135deg, #1a202c 0%, #0d1117 100%);
            }
            
            .ai-control-btn.danger {
                background: linear-gradient(135deg, #fc8181 0%, #f56565 100%);
                color: white;
                box-shadow: 0 2px 8px rgba(245, 101, 101, 0.3);
            }
            
            .ai-control-btn.danger:hover {
                background: linear-gradient(135deg, #f56565 0%, #e53e3e 100%);
            }
            
            .ai-control-btn.secondary {
                background: #f7fafc;
                color: #4a5568;
                border: 1px solid #e2e8f0;
            }
            
            .ai-control-btn.secondary:hover {
                background: #edf2f7;
                border-color: #cbd5e0;
            }
            
            .ai-control-btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
                transform: none !important;
            }
            
            @media (max-width: 480px) {
                #ai-voice-widget {
                    bottom: 16px;
                    right: 16px;
                }
                
                .ai-widget-button {
                    width: 56px;
                    height: 56px;
                }
                
                .ai-widget-button svg {
                    width: 24px;
                    height: 24px;
                }
                
                .ai-widget-panel {
                    width: calc(100vw - 32px);
                    bottom: 76px;
                    max-height: calc(100vh - 120px);
                }
                
                .ai-widget-header {
                    padding: 20px;
                }
                
                .ai-widget-messages {
                    padding: 20px;
                }
                
                .ai-widget-controls {
                    padding: 16px 20px;
                }
            }
        </style>
        
        <button class="ai-widget-button" id="aiWidgetToggle" title="AI Voice Assistant">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
            </svg>
        </button>
        
        <div class="ai-widget-panel" id="aiWidgetPanel">
            <div class="ai-widget-header">
                <h3>🎙️ Voice Assistant</h3>
                <button class="ai-widget-close" id="aiWidgetClose">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                    </svg>
                </button>
            </div>
            
            <div class="ai-widget-status disconnected" id="aiWidgetStatus">
                Ready to start
            </div>
            
            <div class="ai-widget-visualizer" id="aiWidgetVisualizer">
                <div class="ai-visualizer-bar"></div>
                <div class="ai-visualizer-bar"></div>
                <div class="ai-visualizer-bar"></div>
                <div class="ai-visualizer-bar"></div>
                <div class="ai-visualizer-bar"></div>
                <div class="ai-visualizer-bar"></div>
                <div class="ai-visualizer-bar"></div>
                <div class="ai-visualizer-bar"></div>
                <div class="ai-visualizer-bar"></div>
                <div class="ai-visualizer-bar"></div>
                <div class="ai-visualizer-bar"></div>
                <div class="ai-visualizer-bar"></div>
            </div>
            
            <div class="ai-widget-messages" id="aiWidgetMessages">
                <div class="ai-empty-state">
                    <div class="ai-empty-icon">👋</div>
                    <div class="ai-empty-text">Click "Start" and begin speaking</div>
                </div>
            </div>
            
            <div class="ai-widget-controls">
                <button class="ai-control-btn primary" id="aiStartBtn">Start</button>
                <button class="ai-control-btn secondary" id="aiClearBtn">Clear</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(widgetContainer);
    
    // Get elements
    const toggleBtn = document.getElementById('aiWidgetToggle');
    const panel = document.getElementById('aiWidgetPanel');
    const closeBtn = document.getElementById('aiWidgetClose');
    const statusDiv = document.getElementById('aiWidgetStatus');
    const messagesDiv = document.getElementById('aiWidgetMessages');
    const startBtn = document.getElementById('aiStartBtn');
    const clearBtn = document.getElementById('aiClearBtn');
    const visualizerBars = document.querySelectorAll('.ai-visualizer-bar');
    
    // Toggle panel
    toggleBtn.addEventListener('click', () => {
        isWidgetOpen = !isWidgetOpen;
        panel.classList.toggle('open', isWidgetOpen);
    });
    
    closeBtn.addEventListener('click', () => {
        isWidgetOpen = false;
        panel.classList.remove('open');
    });
    
    // Update status
    function updateStatus(status, className) {
        statusDiv.textContent = status;
        statusDiv.className = `ai-widget-status ${className}`;
    }
    
    // Add message
    function addMessage(role, text) {
        const emptyState = messagesDiv.querySelector('.ai-empty-state');
        if (emptyState) {
            emptyState.remove();
        }
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `ai-message ${role}`;
        
        const labelDiv = document.createElement('div');
        labelDiv.className = 'ai-message-label';
        labelDiv.textContent = role === 'user' ? 'You' : 'Assistant';
        
        const textDiv = document.createElement('div');
        textDiv.textContent = text;
        
        messageDiv.appendChild(labelDiv);
        messageDiv.appendChild(textDiv);
        messagesDiv.appendChild(messageDiv);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
        
        return messageDiv;
    }
    
    // Update message
    function updateMessage(messageDiv, text) {
        const textDiv = messageDiv.children[1];
        if (textDiv) {
            textDiv.textContent = text;
        }
    }
    
    // Clear messages
    clearBtn.addEventListener('click', () => {
        messagesDiv.innerHTML = `
            <div class="ai-empty-state">
                <div class="ai-empty-icon">👋</div>
                <div class="ai-empty-text">Click "Start" and begin speaking</div>
            </div>
        `;
    });
    
        // Visualizer animation
        function animateVisualizer(active) {
            visualizerBars.forEach((bar, index) => {
                if (active) {
                    const randomHeight = Math.random() * 48 + 18;
                    const delay = index * 30;
                    setTimeout(() => {
                        bar.style.height = `${randomHeight}px`;
                        bar.style.opacity = '1';
                    }, delay);
                } else {
                    bar.style.height = '18px';
                    bar.style.opacity = '0.6';
                }
            });
        }    // Start/Stop conversation
    startBtn.addEventListener('click', async () => {
        if (isConnected) {
            stopConversation();
        } else {
            await startConversation();
        }
    });
    
    async function startConversation() {
        try {
            updateStatus('Initializing...', 'connecting');
            
            // Initialize audio context
            audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: 24000
            });
            
            // Get microphone access
            mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    sampleRate: 24000,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
            
            // Connect to WebSocket
            ws = new WebSocket(WS_URL);
            
            ws.onopen = () => {
                isConnected = true;
                updateStatus('🟢 Connected - Speak now', 'connected');
                startBtn.textContent = 'Stop';
                startBtn.classList.remove('primary');
                startBtn.classList.add('danger');
                toggleBtn.classList.add('active');
                
                // Send config with agent ID
                ws.send(JSON.stringify({
                    type: 'config',
                    language: 'en',
                    agent_id: AGENT_ID
                }));
                
                startAudioStreaming();
            };
            
            ws.onmessage = async (event) => {
                const data = JSON.parse(event.data);
                const eventType = data.type;
                
                if (eventType === 'input_audio_buffer.speech_started') {
                    updateStatus('🎤 Listening...', 'listening');
                    toggleBtn.classList.add('recording');
                    
                    // Interrupt AI audio
                    if (currentAudioSource) {
                        currentAudioSource.stop();
                        currentAudioSource = null;
                    }
                    audioQueue = [];
                    isPlaying = false;
                    
                    currentUserTranscript = '';
                    lastUserMessageDiv = null;
                    
                    if (!visualizerInterval) {
                        visualizerInterval = setInterval(() => animateVisualizer(true), 100);
                    }
                } 
                else if (eventType === 'input_audio_buffer.speech_stopped') {
                    updateStatus('🤔 Processing...', 'speaking');
                    toggleBtn.classList.remove('recording');
                    if (visualizerInterval) {
                        clearInterval(visualizerInterval);
                        visualizerInterval = null;
                        animateVisualizer(false);
                    }
                }
                else if (eventType === 'deepgram.transcript') {
                    const transcript = data.transcript;
                    const isFinal = data.is_final;
                    
                    if (transcript && transcript.trim()) {
                        if (!lastUserMessageDiv) {
                            lastUserMessageDiv = addMessage('user', transcript);
                            currentUserTranscript = transcript;
                        } else {
                            if (isFinal) {
                                currentUserTranscript = transcript;
                                updateMessage(lastUserMessageDiv, transcript);
                                lastUserMessageDiv = null;
                            } else {
                                updateMessage(lastUserMessageDiv, transcript);
                            }
                        }
                    }
                }
                else if (eventType === 'response.audio_transcript.delta') {
                    currentAssistantTranscript += data.delta;
                }
                else if (eventType === 'response.audio_transcript.done') {
                    if (currentAssistantTranscript && currentAssistantTranscript.trim()) {
                        addMessage('assistant', currentAssistantTranscript);
                    }
                    currentAssistantTranscript = '';
                }
                else if (eventType === 'response.audio.delta') {
                    audioQueue.push(base64ToArrayBuffer(data.delta));
                    if (!isPlaying) {
                        playAudioQueue();
                    }
                }
                else if (eventType === 'response.done') {
                    updateStatus('🟢 Connected - Speak now', 'connected');
                }
                else if (eventType === 'error') {
                    console.error('Error from server:', data);
                    updateStatus('❌ Error occurred', 'disconnected');
                }
            };
            
            ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                updateStatus('❌ Connection error', 'disconnected');
                stopConversation();
            };
            
            ws.onclose = () => {
                stopConversation();
            };
            
        } catch (error) {
            console.error('Error:', error);
            alert('Failed to access microphone or connect to server.');
            stopConversation();
        }
    }
    
    function stopConversation() {
        isConnected = false;
        
        if (currentAudioSource) {
            currentAudioSource.stop();
            currentAudioSource = null;
        }
        audioQueue = [];
        isPlaying = false;
        
        if (audioWorkletNode) {
            audioWorkletNode.disconnect();
            audioWorkletNode = null;
        }
        
        if (mediaStream) {
            mediaStream.getTracks().forEach(track => track.stop());
            mediaStream = null;
        }
        
        if (ws) {
            ws.close();
            ws = null;
        }
        
        if (audioContext) {
            audioContext.close();
            audioContext = null;
        }
        
        if (visualizerInterval) {
            clearInterval(visualizerInterval);
            visualizerInterval = null;
            animateVisualizer(false);
        }
        
        updateStatus('Ready to start', 'disconnected');
        startBtn.textContent = 'Start';
        startBtn.classList.remove('danger');
        startBtn.classList.add('primary');
        toggleBtn.classList.remove('active', 'recording');
    }
    
    function startAudioStreaming() {
        const source = audioContext.createMediaStreamSource(mediaStream);
        const processor = audioContext.createScriptProcessor(4096, 1, 1);
        
        processor.onaudioprocess = (e) => {
            if (!isConnected || !ws || ws.readyState !== WebSocket.OPEN) return;
            
            const inputData = e.inputBuffer.getChannelData(0);
            const pcm16 = convertFloat32ToPCM16(inputData);
            const base64Audio = arrayBufferToBase64(pcm16);
            
            ws.send(JSON.stringify({
                type: 'audio',
                audio: base64Audio
            }));
        };
        
        source.connect(processor);
        processor.connect(audioContext.destination);
        audioWorkletNode = processor;
    }
    
    // Audio utility functions
    function base64ToArrayBuffer(base64) {
        const binaryString = atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    }
    
    function pcm16ToWav(pcm16ArrayBuffer, sampleRate = 24000) {
        const pcm16 = new Int16Array(pcm16ArrayBuffer);
        const wavHeader = new ArrayBuffer(44);
        const view = new DataView(wavHeader);
        
        view.setUint32(0, 0x46464952, true);
        view.setUint32(4, 36 + pcm16.length * 2, true);
        view.setUint32(8, 0x45564157, true);
        view.setUint32(12, 0x20746d66, true);
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        view.setUint32(36, 0x61746164, true);
        view.setUint32(40, pcm16.length * 2, true);
        
        const wavBytes = new Uint8Array(wavHeader.byteLength + pcm16ArrayBuffer.byteLength);
        wavBytes.set(new Uint8Array(wavHeader), 0);
        wavBytes.set(new Uint8Array(pcm16ArrayBuffer), wavHeader.byteLength);
        
        return wavBytes.buffer;
    }
    
    async function playAudioQueue() {
        if (audioQueue.length === 0) {
            isPlaying = false;
            currentAudioSource = null;
            return;
        }
        
        isPlaying = true;
        updateStatus('🔊 Speaking...', 'speaking');
        
        const pcm16Data = audioQueue.shift();
        
        try {
            const wavData = pcm16ToWav(pcm16Data, 24000);
            const audioBuffer = await audioContext.decodeAudioData(wavData);
            const source = audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(audioContext.destination);
            
            currentAudioSource = source;
            
            source.onended = () => {
                currentAudioSource = null;
                playAudioQueue();
            };
            
            source.start();
        } catch (error) {
            console.error('Error playing audio:', error);
            currentAudioSource = null;
            playAudioQueue();
        }
    }
    
    function convertFloat32ToPCM16(float32Array) {
        const pcm16 = new Int16Array(float32Array.length);
        for (let i = 0; i < float32Array.length; i++) {
            const s = Math.max(-1, Math.min(1, float32Array[i]));
            pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        return pcm16.buffer;
    }
    
    function arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }
    
    // Cleanup
    window.addEventListener('beforeunload', () => {
        stopConversation();
    });
    
})();
