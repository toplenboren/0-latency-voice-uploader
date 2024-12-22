class AudioRecorderWorklet extends AudioWorkletProcessor {
    constructor() {
        super();
        this._chunkIndex = 0;
        console.log('Audio recorder worklet created')
    }

    process(inputs, outputs) {
        const input = inputs[0];
        if (!input || !input.length) {
            console.log('No input received');
            return true;
        }
        
        // This is just for debug. Uncomment if you need that
        // console.log('Processing audio:', input.length, 'channels');
        const pcmData = input[0];
        if (pcmData && pcmData.length) {
            const intData = new Int16Array(pcmData.length);
            
            for (let i = 0; i < pcmData.length; i++) {
                intData[i] = pcmData[i] * 0x7FFF;
            }

            this.port.postMessage({
                chunk: intData.buffer,
            }, [intData.buffer]);
        }
        return true;
    }
}

registerProcessor('audio-recorder-worklet', AudioRecorderWorklet); 