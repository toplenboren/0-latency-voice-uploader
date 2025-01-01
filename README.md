## Installation

1. Install Python dependencies:
```bash
pip install -r requirements.txt
```

## Running the app

1. Start the server:
```bash
python server.py
```

2. Open the index.html file

3. Grant rights for microphone and press Start Recording. Talk for a few seconds and then press Stop Recording. 

Recorded WAV files will be saved in the `./recordings/wav` directory in the server. Each recording is named with timestamp and client ID:
```
recordings/recording_YYYYMMDD_HHMMSS_clientid.wav
```

Also check out the logs. They should give you some very basic analytics about latency. (Note that chunk latency is THROTTLE + N) <- N is latency

## Browser Support

I tested it on Firefox, but should work on Chrome too





















