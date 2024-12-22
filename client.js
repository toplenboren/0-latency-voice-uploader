/**
 * This is just a proof of concept of Audio Recording Client with (minimal) latency
 * 
 * This module handles client-side audio recording using Web Audio API and AudioWorklet.
 * It captures audio from the microphone in WAV format, processes it in chunks, and sends them to 
 * the server for WAV file creation.
 * 
 * Key components:
 * - AudioContext: Manages audio processing
 * - AudioWorklet: Processes raw audio data
 * - Throttled sending: Chunks are buffered and sent periodically (Each THROTTLE_INTERVAL)
 */

// Server configuration
const API_URL = 'http://localhost:8765/audio';
const CLIENT_ID = Math.random().toString(36).substring(7);
const THROTTLE_INTERVAL = 1500;  // Time between chunk sends in milliseconds

// Audio processing state
let audioContext;        // The Web Audio context
let audioStream;         // MediaStream from getUserMedia
let recordingSession;    // Current recording session info
let audioProcessor;      // AudioWorkletNode for processing
let audioSource;         // MediaStreamAudioSourceNode

// Chunk management
let lastSendTime = 0;    // Timestamp of last chunk send
let lastChunkIndex = 0;  // Counter for chunk ordering
let pendingChunks = [];  // Buffer for chunks waiting to be sent

// DOM elements
const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const audioContainer = document.getElementById('audioContainer');
const audioPlayer = document.getElementById('audioPlayer');
const recordingDot = document.getElementById('recordingDot');

/**
 * Initializes the microphone and audio processing setup.
 * This function:
 * 1. Requests microphone access
 * 2. Creates AudioContext
 * 3. Loads audio worklet
 * 4. Sets up audio processing pipeline
 */
async function initializeMicrophone() {
    console.info('Initializing microphone')

    try {
        // Request microphone access
        audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioContext = new AudioContext();
        
        // Load and register the audio worklet for processing
        await audioContext.audioWorklet.addModule('audio-worklet.js');
        
        // Create and connect audio nodes
        audioSource = audioContext.createMediaStreamSource(audioStream);
        audioProcessor = new AudioWorkletNode(audioContext, 'audio-recorder-worklet', {
            numberOfInputs: 1,
            numberOfOutputs: 1,
            channelCount: 1,
            processorOptions: {
                sampleRate: audioContext.sampleRate
            }
        });
        
        // Handle processed audio chunks from worklet
        audioProcessor.port.onmessage = (event) => {
            // Uncomment this if you need to debug raw data
            // console.debug('Received message from worklet:', event.data);
            const { chunk } = event.data;
            processIncomingAudioChunkFromAudioContext(chunk);
        };
        
        audioSource.connect(audioProcessor);
        startButton.disabled = false;
        
        // Start in suspended state to avoid immediate recording
        audioContext.suspend()
    } catch (error) {
        console.error('Microphone initialization error:', error);
        startButton.disabled = true;
    }
}

/**
 * Sends accumulated audio chunks to the server.
 * Chunks are combined and sent with metadata including:
 * - Chunk index for ordering
 * - Client ID for session tracking
 * - Sample rate for WAV file creation
 * - Creation timestamp for latency measurement
 */
async function sendPendingChunks() {
    const now = Date.now();

    console.info('Sending chunks:', pendingChunks.length);
    const chunksToSend = pendingChunks;
    pendingChunks = [];
    lastSendTime = now;
    chunkIndex = lastChunkIndex++

    const combinedChunks = chunksToSend.map(item => item.chunk);
    
    const formData = new FormData();
    formData.append('index', chunkIndex);
    formData.append('blob', new Blob(combinedChunks));
    formData.append('client_id', CLIENT_ID);
    formData.append('sample_rate', audioContext.sampleRate);
    formData.append('created_at', chunksToSend[0].time);

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
    } catch (error) {
        console.error('Error sending chunks:', error);
    }
}

/**
 * Processes incoming audio chunks from the AudioWorklet.
 * Implements throttling to avoid overwhelming the server:
 * - Chunks are collected in pendingChunks
 * - Sent periodically based on THROTTLE_INTERVAL
 * 
 * @param {ArrayBuffer} chunk - Raw audio data from AudioWorklet
 */
async function processIncomingAudioChunkFromAudioContext(chunk) {
    const now = Date.now();
    
    pendingChunks.push({ 
        chunk,
        time: now
    });
    
    // Throttle sending to avoid overwhelming the server
    if (Math.abs(now - lastSendTime) < THROTTLE_INTERVAL) {
        return
    }
    
    if (pendingChunks.length > 0) {
        await sendPendingChunks()
    }
}

/**
 * Starts the recording process.
 * Resumes the AudioContext if it was suspended.
 */
async function startRecording() {
    console.info('Starting recording...');
    
    if (audioContext.state === 'suspended') {
        console.log('Resuming audio context...');
        await audioContext.resume();
    }
    
    console.log('Recording setup complete. AudioContext state:', audioContext.state);
}

/**
 * Stops the recording process.
 * 1. Sends any remaining chunks
 * 2. Notifies server to finalize the recording
 * 3. Suspends the AudioContext
 */
function stopRecording() {
    console.info('Ending recording...');

    // Ensure all chunks are sent before stopping
    console.info("Sending pending chunks...", pendingChunks);
    sendPendingChunks().then(() => {
        console.info("Stopping recording on server...")
        stopRecordingOnServer()
    })

    // Suspend audio processing
    if (audioContext && audioContext.state === 'running') {
        console.log('Suspending audio context...');
        audioContext.suspend();
    }
}

/**
 * Notifies the server to finalize the recording.
 * Server will combine all chunks into a single WAV file.
 */
async function stopRecordingOnServer() {
    try {
        const formData = new FormData();
        formData.append('client_id', CLIENT_ID);
        
        const response = await fetch(`${API_URL}_end`, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        console.log('Recording saved:', result);
    } catch (error) {
        console.error('Error finalizing recording:', error);
    }
}

// Event Listeners. Buttons for now, but can be changed to wake up word and 1 second silence or close up word in the future.
startButton.addEventListener('click', async () => {
    if (!audioStream) {
        await initializeMicrophone();
    }
    startButton.disabled = true;
    stopButton.disabled = false;
    recordingDot.classList.add('online');
    console.info('Recording has started:', new Date().toISOString())
    await startRecording();
});

stopButton.addEventListener('click', async () => {
    stopRecording();
    startButton.disabled = false;
    stopButton.disabled = true;
    recordingDot.classList.remove('online');
});

// This is here just to initialize this script on load
initializeMicrophone();
  