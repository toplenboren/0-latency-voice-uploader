# Low-Latency Audio Recorder

A proof-of-concept web application demonstrating low-latency audio recording using Web Audio API and AudioWorklet.

## Installation

1. Install Python dependencies:
```bash
pip install -r requirements.txt
```

## Important: Running the Application

Due to browser security restrictions around AudioWorklet, **you must serve both the client and server from the same origin**. I already implemented it, so running the server will run you client as well 

1. Start the server:
```bash
python server.py
```

2. Access the application thorough web browser:
```
http://localhost:8765
```

Do not try to open index.html directly in your browser - it won't work!

3. Grant rights for microphone and press Start Recording. Talk for a few seconds and then press Stop Recording. 

Recorded WAV files will be saved in the `./recordings` directory in the server. Each recording is named with timestamp and client ID:
```
recordings/recording_YYYYMMDD_HHMMSS_clientid.wav
```

Also check out the logs. They should give you some very basic analytics about latency. (Note that chunk latency is THROTTLE + N) <- N is latency

## Browser Support

I tested it on Firefox, but should work on Chrome too

Note: Safari has limited AudioWorklet support (just as always -> so I need to further test it on iPhones / iPads)


# Seems like frontend uses webm, and not wav :-( APIs for working with Wave files are more complex 

# I can easily record .webm files ( client records webm -> client sends chunk every second -> chunk is converted using ffmpeg ) 

+ Code will be more simple (!)
+ Probably less problems with compatibility

- Need to have ffmpeg
- Or need to code the conversion step (+latency)

# Record .wav

- no need to have any new dependencies
- more complex code
- may be more problems with compatibility
- https / single origin / cannot have frontend served just as file :-(

























