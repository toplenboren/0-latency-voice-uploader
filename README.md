# Kaia frontend

This is a frontend for Kaia – kitchen ai assistant by @okulovsky

![alt text](docs/image.png)

## Installation

1. Install Python dependencies:
```bash
# I recommend you to create a virtual environment. Check your system vendor for details 
pip install -r requirements.txt
```

2. Install js dependencies:
```
cd v2
npm install
```

## Running the app

1. Start the backend:
```bash
python server.py
```

2. Start js frontend:
```
npm run dev
```

3. Grant rights for microphone and say the wakeword. Talk for a few seconds and then be silent. Recording will be uploaded to backend 

Recorded WAV files will be saved in the `./recordings/wav` directory in the server. Each recording is named with timestamp and client ID:
```
recordings/recording_YYYYMMDD_HHMMSS_clientid.wav
```

## Browser Support

I tested it on Firefox, but should work on Chrome too


## Wakeword detection:

This package uses vosk offline speech recognition. 

- documentation: [text](https://github.com/solyarisoftware/voskJs)
- download more models: [text](https://alphacephei.com/vosk/models)


















