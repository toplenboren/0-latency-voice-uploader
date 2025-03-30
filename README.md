# Kaia frontend

This is a simple web based frontend for Kaia – kitchen ai assistant by @okulovsky

![alt text](docs/img.png)

## Requirements:

1. You should have `NodeJS` installed. Best to stick to the 18+ versions 
2. Install js dependencies:
```
npm install
```

## Running the app

1. You should have Kaia running

2. Start js frontend:
```
npm run dev
```

3. Go to `localhost:5137`. Then grant rights for microphone and say the wakeword. Talk for a few seconds and then stay silent. Recording will be uploaded to Kaia


## Browser Support

I tested it on Firefox, but should work on Chrome too


## Wakeword detection:

This package uses vosk offline speech recognition. 

- documentation: [text](https://github.com/solyarisoftware/voskJs)
- download more models: [text](https://alphacephei.com/vosk/models)


## How it works

![arch.png](docs/arch.png)























