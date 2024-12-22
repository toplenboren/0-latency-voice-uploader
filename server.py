from flask import Flask, request, send_from_directory
import os
from datetime import datetime
import wave
import time
from collections import defaultdict

app = Flask(__name__)

# Serve static files from the current directory
@app.route('/')
def serve_index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:filename>')
def serve_static(filename):
    return send_from_directory('.', filename)

RECORDINGS_DIR = 'recordings'
os.makedirs(RECORDINGS_DIR, exist_ok=True)

# Store chunks in memory
audio_chunks = defaultdict(list)  # client_id -> list of (index, data) tuples
sample_rates = {}  # client_id -> sample_rate

@app.route('/audio', methods=['POST'])
def handle_audio_chunk():
    receive_time = time.time() * 1000
    
    client_id = request.form['client_id']
    chunk_index = int(request.form['index'])
    chunk_created_at = int(request.form['created_at'])
    pcm_data = request.files['blob'].read()
    sample_rate = int(request.form['sample_rate'])
    
    # Store sample rate for this client
    sample_rates[client_id] = sample_rate
    
    # Store chunk in memory
    audio_chunks[client_id].append((chunk_index, pcm_data))
    
    process_time = time.time() * 1000 - receive_time
    latency = receive_time - chunk_created_at
    
    print(f'Chunk {chunk_index}: Created at {chunk_created_at:.0f}ms, Received at {receive_time:.0f}ms (latency: {latency:.0f}ms), Buffered in {process_time:.0f}ms')
    
    return {'status': 'ok', 'chunk_index': chunk_index}

@app.route('/audio_end', methods=['POST'])
def handle_audio_end():
    start_time = time.time() * 1000
    
    client_id = request.form['client_id']
    if client_id not in audio_chunks:
        return {'status': 'error', 'message': 'No audio chunks found for client'}
    
    # Sort chunks by index
    chunks = sorted(audio_chunks[client_id], key=lambda x: x[0])
    total_chunks = len(chunks)
    
    # Create WAV file
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    filename = f'{RECORDINGS_DIR}/recording_{timestamp}_{client_id}.wav'
    
    with wave.open(filename, 'wb') as wav_file:
        wav_file.setnchannels(1)  # Mono
        wav_file.setsampwidth(2)  # 16-bit
        wav_file.setframerate(sample_rates[client_id])
        
        # Write all chunks at once
        for _, chunk_data in chunks:
            wav_file.writeframes(chunk_data)
    
    # Clear the chunks from memory
    del audio_chunks[client_id]
    del sample_rates[client_id]
    
    end_time = time.time() * 1000
    process_time = end_time - start_time
    
    print(f'Recording ended for {client_id}: Wrote {total_chunks} chunks to {filename} in {process_time:.0f}ms')
    
    return {
        'status': 'ok',
        'filename': filename,
        'chunks': total_chunks,
        'process_time': process_time
    }

if __name__ == '__main__':
    from flask_cors import CORS
    CORS(app)
    
    port = 8765
    host = '0.0.0.0'
    
    print(f"\n🚀 Server running!")
    print(f"📱 Local:   http://localhost:{port}")
    print(f"🌍 Network: http://{host}:{port}")
    print("\nPress CTRL+C to quit\n")
    
    app.run(host=host, port=port, debug=True) 