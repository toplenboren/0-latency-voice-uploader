/**
 * AudioControl handles all audio playback and recording in Kaia
 *
 * It has three main components:
 *
 * 1. Wakeword detection
 * 2. Raw WAV recorder
 * 3. Volume control
 *
 * AudioControl Fires hook on some event -> Kaia handles the event
 */

export enum STATES {
    STANDBY = 'standby',
    OPEN = 'open',
    RECORDING = 'recording',
    PLAYING = 'playing',
}

export const ALLOWED_STATE_TRANSITIONS = {
    [STATES.STANDBY]: [STATES.OPEN, STATES.PLAYING],
    [STATES.OPEN]: [STATES.RECORDING, STATES.PLAYING],
    [STATES.RECORDING]: [STATES.PLAYING],
    [STATES.PLAYING]: [STATES.RECORDING, STATES.STANDBY, STATES.OPEN]
}

export interface IAudioControlConfig {
    wakeword: string
    voskModelUrl: string

    onWakeword: () => void
    onStopRecording: (recordingId: string) => void
    onStartRecording: (recordingId: string) => void

    onRecordingChunk?: (index: number, audioChunks: Blob[]) => void
    onVolumeChange?: (volume: number) => void
    onAudioPlayStart?: (path: string) => void
    onAudioPlayEnd?: (path: string) => void

    playSounds: boolean,

    // How much noise is considered silence?
    silenceThreshold: number

    // How much time to wait from silence start until ending recording
    silenceTimeDelta: number

    // chunk length for mediarecorder
    recordingChunkLength: number

    // How often to collect chunks in milliseconds
    mediaRecorderChunkLength: number

    sampleRate: number,
    volumeHistorySeconds: number,
    sampleInterval: number,
    fftSize: number,
    smoothingTimeConstant: number,
}

const DEFAULT_AUDIO_CONTROL_CONFIG: Partial<IAudioControlConfig> = {
    wakeword: 'computer',

    playSounds: false,

    recordingChunkLength: 1000, // Time between chunk sends in milliseconds

    silenceThreshold: 15,

    silenceTimeDelta: 1500,

    mediaRecorderChunkLength: 100,
    sampleRate: 48000,
    volumeHistorySeconds: 0.5,
    sampleInterval: 60,
    fftSize: 256,
    smoothingTimeConstant: 0.8,
};

export class AudioControl {
    private config: IAudioControlConfig
    private state: STATES

    private audioStream: MediaStream
    private audioContext: AudioContext
    private analyser: AnalyserNode
    private microphone: any
    private recognizer: AudioWorkletNode
    private recognizerProcessor: AudioWorkletNode
    private mediaRecorder: MediaRecorder

    private chunkIsBeingSent: boolean
    private currentRecordingId: string | null
    private audioChunks: Blob[]
    private lastChunkIndex: number
    private lastSendTime: number
    private audioWorkletNode: AudioWorkletNode;
    private volumeHistory: any[];
    private silenceStartTime: number;
    private historyIndex: number;

    constructor(userConfig: Partial<IAudioControlConfig>) {
        const config = { ...DEFAULT_AUDIO_CONTROL_CONFIG, ...userConfig } as IAudioControlConfig;

        if (config.recordingChunkLength <= config.mediaRecorderChunkLength) {
            throw new Error(`RecordingChunkLength should be bigger then ${config.mediaRecorderChunkLength}`)
        }
        
        this.config = config

        this.state = STATES.STANDBY
        
        this.currentRecordingId = null;
        this.audioChunks = [];
        this.lastChunkIndex = 0;
        this.lastSendTime = 0;
        this.chunkIsBeingSent = false
    }

    _changeState(newState: STATES): void {
        console.debug(`[audioControl] changing state: from ${this.state} to ${newState}`);
        this.state = newState;
    }

    getState() {
        return this.state
    }

    _playStartSound() {
        if (!this.config.playSounds) { return }
        this._playSound('/beep_lo.wav')
    }

    _playErrorSound() {
        if (!this.config.playSounds) { return }
        this._playSound('/beep_error.wav')
    }

    _playStopSound() {
        if (!this.config.playSounds) { return }
        this._playSound('/beep_hi.wav')
    }

    _playSound(path: string, onPlaybackEnd: Function | null = null) {
        const audio = new Audio(path);
        audio.play().catch(error => {
            console.warn('[audioControl] Failed to play start sound:', error);
        });

        audio.addEventListener("ended", () => {
            if (onPlaybackEnd) { onPlaybackEnd() }
        })
    }

    async initialize() {
        try {
            console.debug('[audioControl] Initializing audio control Microphone...')
            await this._setupMicrophone();
            
            console.debug('[audioControl] Initializing volume control...')
            await this._setupVolumeControl();

            console.debug('[audioControl] Initializing audio control Wakeword detection...')
            await this._setupVoiceRecognition();
        } catch (error) {
            console.error('[audioControl] Initialization failed:', error);
        }
    }

    async _onWakeword() {
        console.info('[audioControl] Wakeword detected')

        // State processing.

        if (this.config.onWakeword) {
            this.config.onWakeword()
        }

        await this.startRecording()
    }

    async _sendPendingChunks() {
        console.debug(`[audioControl] Send pending chunks called. total chunks to send: ${this.audioChunks.length}`)

        const now = Date.now();

        if (this.audioChunks.length === 0) {
            return
        }
        
        const index = this.lastChunkIndex++
        const audioChunks = this.audioChunks

        try { 
            await this.config.onRecordingChunk(index, audioChunks)

            this.audioChunks = []
            this.lastSendTime = now
        } catch (err) {
            console.error('[audioControl] failed to upload audio chunks', err)
        }
    }

    async _onRecordingChunkReady() {
        console.log('[audioControl] Recording chunk is ready')

        await this._sendPendingChunks()

        this.chunkIsBeingSent = false
    }

    async _setupMicrophone() {
        this.audioStream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                channelCount: 1
            }
        });

        // In Apple garden you may not have access to AudioContext, but will have access to webkitAudioContext
        // @ts-ignore
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // Initialize audio processing
        const source = this.audioContext.createMediaStreamSource(this.audioStream);
        
        // Load audio worklet
        const processorUrl = new URL('/audio-worklet-processor.js', window.location.href).href;
        await this.audioContext.audioWorklet.addModule(processorUrl);
        this.audioWorkletNode = new AudioWorkletNode(this.audioContext, 'audio-recorder-processor');
        
        // Handle audio data from worklet
        this.audioWorkletNode.port.onmessage = async (e) => {
            if (e.data.type === 'chunk') {
                const blob = new Blob([e.data.audioData], { type: 'audio/wav' });
                this.audioChunks.push(blob);
                
                if (!this.chunkIsBeingSent && this.getState() === STATES.RECORDING) {
                    this.chunkIsBeingSent = true;
                    try {
                        await this._onRecordingChunkReady();
                    } finally {
                        this.chunkIsBeingSent = false;
                        this.lastSendTime = Date.now();
                    }
                }
            }
        };

        source.connect(this.audioWorkletNode);
        this.audioWorkletNode.connect(this.audioContext.destination);
    }

    async _setupVolumeControl() {
        this.analyser = this.audioContext.createAnalyser();
        this.microphone = this.audioContext.createMediaStreamSource(this.audioStream);
        this.microphone.connect(this.analyser);
        
        this.analyser.fftSize = this.config.fftSize;
        this.analyser.smoothingTimeConstant = this.config.smoothingTimeConstant;

        this.volumeHistory = new Array(this.config.volumeHistorySeconds * this.config.sampleInterval).fill(0);
        this.historyIndex = 0;
        this.silenceStartTime = null;

        const updateVolume = () => {
            const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
            this.analyser.getByteFrequencyData(dataArray);
            
            const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
            const volume = Math.round(average);
            
            this.volumeHistory[this.historyIndex] = volume;
            this.historyIndex = (this.historyIndex + 1) % this.volumeHistory.length;
            
            const meanVolume = Math.round(
                this.volumeHistory.reduce((a, b) => a + b) / this.volumeHistory.length
            );
            
            if (this.getState() === STATES.RECORDING) {
                if (meanVolume < this.config.silenceThreshold) {
                    if (!this.silenceStartTime) {
                        this.silenceStartTime = Date.now()
                        console.debug(`[audioControl] Silence started: volume ${meanVolume} < threshold ${this.config.silenceThreshold}`)
                    } else if (Date.now() - this.silenceStartTime >= this.config.silenceTimeDelta) {
                        console.debug(`[audioControl] Stopping: silence lasted ${Date.now() - this.silenceStartTime}ms`)
                        this.stopRecording()
                        this.silenceStartTime = null;
                    }
                } else {
                    this.silenceStartTime = null;
                }
            }

            if (this.config.onVolumeChange) {
                this.config.onVolumeChange(meanVolume);
            }

            requestAnimationFrame(updateVolume)
        };

        updateVolume()
    }

    async _setupVoiceRecognition() {
        try {
            if (!window.Vosk) {
                throw new Error('[audioControl] Vosk library not loaded.')
            }

            console.debug('[audioControl] Loading VOSK model from:', this.config.voskModelUrl)
            const channel = new MessageChannel()
            const model = await Vosk.createModel(this.config.voskModelUrl)
            model.registerPort(channel.port1)

            this.recognizer = new model.KaldiRecognizer(this.audioContext.sampleRate)
            this.recognizer.setWords(true)

            this.recognizer.on("result", (message) => {
                const word = message.result.text.toLowerCase().trim();
                this._processRecognizedWord(word);
            });

            const processorUrl = new URL('recognizer-processor.js', window.location.href).href
            await this.audioContext.audioWorklet.addModule(processorUrl)
            
            this.recognizerProcessor = new AudioWorkletNode(this.audioContext, 'recognizer-processor', {
                channelCount: 1
            });
            
            this.recognizerProcessor.port.postMessage(
                { action: 'init', recognizerId: this.recognizer.id },
                [channel.port2]
            );

            const source = this.audioContext.createMediaStreamSource(this.audioStream)
            source.connect(this.recognizerProcessor)
            this.recognizerProcessor.connect(this.audioContext.destination)

        } catch (error) {
            console.error('[audioControl] Voice recognition initialization error:', error)
            throw error
        }
    }

    _processRecognizedWord(word) {
        if (word === this.config.wakeword && this.getState() !== STATES.PLAYING) {
            this._onWakeword()
        }

        // if (word === this.config.cancelword) {
        //     this.cancelRecording()
        // }
    }

    async playAudio(path) {
        console.debug('[audioControl] playAudio signal detected')
        if (this.getState() === STATES.PLAYING) {
            return
        }

        this._changeState(STATES.PLAYING)

        this._playSound(path, () => this._changeState(STATES.STANDBY))
    }

    async cancelRecording() {
        console.debug('[audioControl] Cancelling recording...')

        this.audioChunks = []
        this.lastChunkIndex = 0;
        this.lastSendTime = 0;
    }

    async stopRecording() {
        if (this.getState() === STATES.RECORDING) {
            console.debug('[audioControl] Ending recording...');
            
            try {
                this.audioWorkletNode.port.postMessage({ command: 'stop' });
                this._changeState(STATES.STANDBY);
                
                await this._sendPendingChunks();
                
                if (this.config.onStopRecording) {
                    await this.config.onStopRecording(this.currentRecordingId);
                }
                
                console.debug('[audioControl] Recording stopped successfully');
                this._playStopSound();
            } catch (error) {
                console.error('[audioControl] Error stopping recording:', error);
                this._playErrorSound();
            }
        }
    }

    async startRecording() {
        console.debug('[audioControl] Starting recording...');
        
        this._changeState(STATES.RECORDING);
        this.audioChunks = [];
        this.audioWorkletNode.port.postMessage({ command: 'start' });
        this._playStartSound();

        if (this.config.onStartRecording) {
            await this.config.onStartRecording(this.currentRecordingId);
        }
    }
}