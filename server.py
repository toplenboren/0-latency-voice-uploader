from flask import Flask, request, send_from_directory
import os
from datetime import datetime
import time
from collections import defaultdict
import subprocess

app = Flask(__name__)

# Update directories
RECORDINGS_DIR = 'recordings'
WAV_DIR = os.path.join(RECORDINGS_DIR, 'wav')
os.makedirs(WAV_DIR, exist_ok=True)

# Store chunks in memory
audio_chunks = defaultdict(list)  # client_id -> list of (index, data) tuples

@app.route('/audio', methods=['POST'])
def handle_audio_chunk():
    receive_time = time.time() * 1000
    
    client_id = request.form['client_id']
    chunk_index = int(request.form['index'])
    chunk_created_at = int(request.form['created_at'])
    webm_data = request.files['blob'].read()
    
    # Store chunk in memory
    audio_chunks[client_id].append((chunk_index, webm_data))
    
    process_time = time.time() * 1000 - receive_time
    latency = receive_time - chunk_created_at
    
    print(f'Chunk {chunk_index}: Client {client_id}, Size: {len(webm_data)} bytes')
    print(f'Current chunks for client {client_id}: {len(audio_chunks[client_id])}')
    
    return {'status': 'ok', 'chunk_index': chunk_index}

@app.route('/audio_end', methods=['POST'])
def handle_audio_end():
    start_time = time.time() * 1000
    
    client_id = request.form['client_id']
    print(f'\nProcessing end request for client {client_id}')
    print(f'Available clients: {list(audio_chunks.keys())}')
    
    if client_id not in audio_chunks:
        print(f'Error: No chunks found for client {client_id}')
        return {'status': 'error', 'message': 'No audio chunks found for client'}
    
    chunks = sorted(audio_chunks[client_id], key=lambda x: x[0])
    total_chunks = len(chunks)
    print(f'Found {total_chunks} chunks for client {client_id}')
    
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    wav_filename = f'{WAV_DIR}/recording_{timestamp}_{client_id}.wav'
    temp_webm = f'{WAV_DIR}/temp_{client_id}.webm'
    
    print(f'Creating temporary WebM file: {temp_webm}')
    try:
        with open(temp_webm, 'wb') as f:
            for idx, (chunk_idx, chunk_data) in enumerate(chunks):
                f.write(chunk_data)
                print(f'Wrote chunk {chunk_idx} ({len(chunk_data)} bytes)')
        
        print(f'Converting to WAV: {wav_filename}')
        result = subprocess.run([
            'ffmpeg',
            '-i', temp_webm,
            '-acodec', 'pcm_s16le',
            '-ar', '44100',
            '-y',
            wav_filename
        ], capture_output=True, text=True)
        
        if result.returncode != 0:
            print(f'FFmpeg error: {result.stderr}')
            return {'status': 'error', 'message': 'FFmpeg conversion failed'}
            
    except Exception as e:
        print(f'Error during processing: {str(e)}')
        return {'status': 'error', 'message': str(e)}
    finally:
        print(f'Cleaning up temp file: {temp_webm}')
        if os.path.exists(temp_webm):
            os.unlink(temp_webm)
    
    # Clear the chunks from memory
    print(f'Clearing chunks for client {client_id}')
    del audio_chunks[client_id]
    
    end_time = time.time() * 1000
    process_time = end_time - start_time
    
    print(f'Successfully processed recording for client {client_id}\n')
    
    return {
        'status': 'ok',
        'wav_filename': wav_filename,
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