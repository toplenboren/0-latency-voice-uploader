import { UIControl, IUIControlConfig } from './uiControl'
import { Api, IApiConfig } from './api.js'
import { AudioControl, IAudioControlConfig } from './audioControl.js'
import { AudioControlInjector} from './audioControlInjector.js'

interface IKaiaConfig {
    playSounds: boolean,
    sessionId: string

    wakeword: string
    voskModelUrl: string

    chatContainerId: string
    pictureContainerId: string,
    placeholderImagePath?: string,

    kaiaServerBaseUrl: string,
    audioServerBaseUrl: string,
    
    silenceThreshold?: number,
    silenceTimeDelta?: number,
    wakewordTimeDelta?: number,
    smoothingTimeConstant?: number,
    mediaRecorderChunkLength?: number,
}

class KaiaApp {
    lastMessageIndex

    config: IKaiaConfig
    sessionId: string

    uiControl?: UIControl
    api?: Api
    audioControl?: AudioControl
    audioControlInjector: AudioControlInjector

    constructor (config: IKaiaConfig) {
        this.sessionId = config?.sessionId || Math.floor(Math.random() * 1000000).toString()

        this.lastMessageIndex = 0

        this.config = config
    }

    async processUpdates () {
        if (!this.api || !this.uiControl || !this.audioControl) {
            throw new Error('Kaia is not properly initialized')
        }

        const updates = await this.api.getUpdates(this.lastMessageIndex)
        
        for (const update of updates) {
            if (update.id > this.lastMessageIndex) {
                this.lastMessageIndex = update.id
            } else {
                continue
            }

            if (update['type'] == 'reaction_message') {
                const payloadText = update?.payload?.text

                const payloadType = update?.payload?.type

                const payloadAvatar = update?.payload?.avatar
                const payloadAvatarPath = `${this.api.config.kaiaServerBaseUrl}${payloadAvatar}`
                
                const chatMessageOptions = {
                    type: payloadType === 'FromUser' ? 'from' : 'to',
                    avatar: payloadAvatar ? payloadAvatarPath : undefined
                }

                this.uiControl.addChatMessage(payloadText, chatMessageOptions)
            }
            
            if (update['type'] == 'reaction_image') {
                const imageName = update?.payload?.filename
                const imagePath = `${this.api.config.kaiaServerBaseUrl}/file/${imageName}`
                this.uiControl.changePicture(imagePath)
            }

            if (update['type'] == 'injection_audio') {
                const injection_filename = update?.payload?.filename
                const injection_url = `${this.api.config.kaiaServerBaseUrl}/file/${injection_filename}`
                if (injection_url && this.audioControl) {
                    console.debug(`[kaia] Injection audio requested: ${injection_url}`)
                    await this.audioControlInjector.inject_audio(injection_url)
                } else {
                    console.warn('[kaia] Injection audio update received without a valid payload')
                }
            }


            if (update['type'] == 'reaction_audio') {
                const audioName = update?.payload?.filename
                const audioPath = `${this.api.config.kaiaServerBaseUrl}/file/${audioName}`

                this.audioControl.playAudio(audioPath)
                return
            }

            // This occurs when kaia server is restarted. This is the first message to be put in query
            // This means that we need to restart chat
            if (update['type'] == 'notification_driver_start') {
                this.uiControl.addChatMessage('Kaia server was restarted', { type: "service" })
            }
        }

        setTimeout(this.processUpdates.bind(this), 1000)
    }

    async initialize () {
        try {
            const uiControlConfig: IUIControlConfig = {
                chatContainerId: this.config.chatContainerId,
                pictureContainerId: this.config.pictureContainerId,
                placeholderImagePath: this.config.placeholderImagePath
            }

            const uiControl = new UIControl(uiControlConfig)

            const apiConfig: IApiConfig = {
                sessionId: this.config.sessionId,
                kaiaServerBaseUrl: this.config.kaiaServerBaseUrl,
                audioServerBaseUrl: this.config.audioServerBaseUrl,
            }

            const api = new Api(apiConfig)

            const silenceThreshold = this.config.silenceThreshold || 15

            const audioControlConfig: Partial<IAudioControlConfig> = {
                wakeword: this.config.wakeword,
                voskModelUrl: this.config.voskModelUrl,
                silenceThreshold: silenceThreshold,
                silenceTimeDelta: this.config.silenceTimeDelta || 1500,
                wakewordTimeDelta: this.config.wakewordTimeDelta || 5000,
                smoothingTimeConstant: this.config.smoothingTimeConstant || 0.8,
                mediaRecorderChunkLength: this.config.mediaRecorderChunkLength || 100,

                playSounds: this.config.playSounds || true,

                onWakeword: async (word: string) => {
                    uiControl.addChatMessage('Wakeword detected', { type: 'service' })
                    const sendWakewordCommandResponse = await api.sendCommandWakeWord(word)
                    console.debug('[kaia] Sent wakeword command', sendWakewordCommandResponse)
                },

                onStartRecording: () => {
                    uiControl.addChatMessage(`Recording just started`, { type: 'service' })
                },

                onRecordingChunk: async (index: number, audioChunks: Blob[]) => {
                    console.debug(`[kaia] Recording chunk reported: index=${index}, totalChunks=${audioChunks.length}`)
                    await api.uploadAudioChunk(index, audioChunks)
                },

                onStopRecording: async () => {
                    console.debug('[kaia] Stopping recording')
                    const stopRecordingResponse = await api.stopRecording()
                    console.debug('[kaia] Stop recording response:', stopRecordingResponse)  
                    uiControl.addChatMessage(`Recording saved to Kaia server, ${stopRecordingResponse.wav_filename}`, { type: 'service' })
                    if (stopRecordingResponse && stopRecordingResponse.wav_filename) { 
                        const sendAudioCommandResponse = await api.sendCommandAudio(stopRecordingResponse.wav_filename)
                        console.debug('[kaia] Sent audio command', sendAudioCommandResponse)
                    }
                },

                onAudioPlayEnd: async (path: string) => {
                    console.debug(`[kaia] Audio play ended, ${path} sending confirmation signal`)
                    api.sendConfirmationAudio(path)
                    setTimeout(this.processUpdates.bind(this), 1)
                },

                onVolumeChange: async (volume: number) => {
                    uiControl._debugUpdateVolume(volume)
                },

                onStateChange: async (state: string) => {
                    uiControl._debugUpdateState(state)
                }
            }

            const audioControl = new AudioControl(audioControlConfig)
            await audioControl.initialize()

            const audioControlInjector = new AudioControlInjector(audioControl)

            this.api = api
            this.audioControl = audioControl
            this.uiControl = uiControl
            this.audioControlInjector = audioControlInjector

            uiControl._debugSetThreshold(silenceThreshold)

            try {
                const initializeResponse = await api.commandInitialize()
                console.info('initializeResponse', initializeResponse)
                
                if (initializeResponse && initializeResponse.id) {
                    this.lastMessageIndex = initializeResponse.id
                }
                
                uiControl.addChatMessage(`Please say: "${this.config.wakeword}" and start talking.. Kaia client_id is ${this.config.sessionId}. Last message index: ${this.lastMessageIndex}`, { type: 'service' })
                setTimeout(this.processUpdates.bind(this), 1)
            } catch (error) {
                console.error('[kaia] Failed to initialize Kaia server:', error)
                uiControl.addChatMessage('Unable to connect to Kaia server. Please check if Kaia server is running', { type: 'service' })
                uiControl.addChatMessage(`Current server URL: ${this.config.kaiaServerBaseUrl}`, { type: 'service' })
            }
        } catch (error) {
            console.error('[kaia] Failed to initialize Kaia:', error)
        }
    }
}

let userConfig = {}

if (typeof window !== 'undefined') {
    const urlParams = new URLSearchParams(window.location.search)
    const configParam = urlParams.get('config')
    
    if (configParam) {
        try {
            userConfig = JSON.parse(decodeURIComponent(configParam))

            console.debug('[kaia] User config detected', userConfig)
        } catch (e) {
            console.error('[kaia] Failed to parse config from URL:', e)
        }
    }
}

const kaia = new KaiaApp({
    playSounds: true,

    sessionId: 'test',
    wakeword: 'computer',

    voskModelUrl: '/models/vosk-model-small-en-us-0.15.zip',

    chatContainerId: 'chatMessages',
    pictureContainerId: 'pictureDisplay',
    placeholderImagePath: 'placeholder.svg',

    kaiaServerBaseUrl: 'http://localhost:8890',
    audioServerBaseUrl: 'http://localhost:13000',
    
    silenceThreshold: 15,
    wakewordTimeDelta: 5000,

    ...userConfig
})

export default kaia