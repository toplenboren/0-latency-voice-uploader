/**
 * This is just a proof of concept of Audio Recording Client with (minimal) latency
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
let mediaRecorder;       // MediaRecorder instance
let audioStream;         // MediaStream from getUserMedia
let recordingSession;    // Current recording session info
let audioChunks = [];    // Buffer for audio chunks

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
        audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        startButton.disabled = false;
        
        // Log supported formats
        const supportedMimeTypes = [
            'audio/webm',
            'audio/webm;codecs=opus',
        ].filter(mimeType => MediaRecorder.isTypeSupported(mimeType));
        
        console.info('Supported MIME types:', supportedMimeTypes);
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
    console.info('Sending chunks:', audioChunks.length);
    
    const formData = new FormData();
    formData.append('index', lastChunkIndex++);
    formData.append('blob', new Blob(audioChunks, { type: 'audio/webm' }));
    formData.append('client_id', CLIENT_ID);
    formData.append('created_at', now);

    audioChunks = [];  // Clear the buffer
    lastSendTime = now;

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
    
    // Reset state before starting new recording
    audioChunks = [];
    lastChunkIndex = 0;
    lastSendTime = 0;
    pendingChunks = [];
    
    mediaRecorder = new MediaRecorder(audioStream, {
        mimeType: 'audio/webm;codecs=opus',
        bitsPerSecond: 128000
    });
    
    mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
            audioChunks.push(event.data);
            
            // Send chunks periodically
            const now = Date.now();
            if (Math.abs(now - lastSendTime) >= THROTTLE_INTERVAL) {
                sendPendingChunks();
            }
        }
    };
    
    mediaRecorder.start(500);  // Collect data every 500ms
    console.log('Recording started');
}

/**
 * Stops the recording process.
 * 1. Sends any remaining chunks
 * 2. Notifies server to finalize the recording
 * 3. Suspends the AudioContext
 */
function stopRecording() {
    console.info('Ending recording...');

    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        
        // Send any remaining chunks
        if (audioChunks.length > 0) {
            console.info("Sending final chunks...");
            sendPendingChunks().then(() => {
                console.info("Stopping recording on server...")
                stopRecordingOnServer();
            });
        } else {
            // Add this to handle case when no chunks are pending
            console.info("No final chunks, stopping recording on server...")
            stopRecordingOnServer();
        }
        
        // Reset state for next recording
        audioChunks = [];
        lastChunkIndex = 0;
        lastSendTime = 0;
        pendingChunks = [];
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
