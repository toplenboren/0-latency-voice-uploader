// Server configuration
const API_URL = 'http://localhost:8765/audio';
const CLIENT_ID = Math.random().toString(36).substring(7);
const THROTTLE_INTERVAL = 1500;  // Time between chunk sends in milliseconds
const BITRATE = 128000 // 128k

let mediaRecorder;
let audioStream;
let recordingSession;
let audioChunks = [];
let lastSendTime = 0;  
let lastChunkIndex = 0;
let pendingChunks = [];

const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const audioContainer = document.getElementById('audioContainer');
const audioPlayer = document.getElementById('audioPlayer');
const recordingDot = document.getElementById('recordingDot');

async function initializeMicrophone() {
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
 * This function sends all pending audio chunks to server
 */
async function sendPendingChunks() {
    const now = Date.now();

    if (audioChunks.length === 0) {
        return
    }
    
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

async function startRecording() {
    console.info('Starting recording...');
    
    // Reset state before starting new recording
    audioChunks = [];
    lastChunkIndex = 0;
    lastSendTime = 0;
    pendingChunks = [];
    
    mediaRecorder = new MediaRecorder(audioStream, {
        mimeType: 'audio/webm;codecs=opus',
        bitsPerSecond: BITRATE 
    });
    
    mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
            audioChunks.push(event.data);
            
            const now = Date.now();
            if (Math.abs(now - lastSendTime) >= THROTTLE_INTERVAL) {
                sendPendingChunks();
            }
        }
    };
    
    mediaRecorder.start(100);
    console.log('Recording started');
}

/**
 * Stops the recording process.
 * 1. Sends any remaining chunks
 * 2. Notifies server to finalize the recording
 * 3. Suspends the AudioContext
 */
async function stopRecording() {
    console.info('Ending recording...');

    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop()
        
        await sendPendingChunks()
        await stopRecordingOnServer()
        
        // Reset state for next recording
        audioChunks = []
        lastChunkIndex = 0
        lastSendTime = 0
        pendingChunks = []
    }
}

/**
 * Notifies the server to finalize the recording.
 * Server will combine all chunks into a single file.
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
    await stopRecording();

    startButton.disabled = false;
    stopButton.disabled = true;
    recordingDot.classList.remove('online');
});

// This is here just to initialize this script on load
initializeMicrophone();
