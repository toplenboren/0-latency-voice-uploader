import { UIControl, IUIControlConfig } from './uiControl';
import { Api, IApiConfig } from './api.js';
import { AudioControl, IAudioControlConfig } from './audioControl.js';

interface IKaiaConfig {
    playSounds: boolean,
    sessionId: string

    wakeword: string
    voskModelUrl: string

    chatContainerId: string
    pictureContainerId: string,

    kaiaServerBaseUrl: string,
    audioServerBaseUrl: string,
}

class KaiaApp {
    lastMessageIndex

    config: IKaiaConfig
    sessionId: string

    uiControl?: UIControl
    api?: Api
    audioControl?: AudioControl

    constructor(config: IKaiaConfig) {
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

                // @ts-ignore
                this.uiControl.addChatMessage(payloadText, chatMessageOptions)
            }
            
            if (update['type'] == 'reaction_image') {
                const imageName = update?.payload?.filename
                const imagePath = `${this.api.config.kaiaServerBaseUrl}/file/${imageName}`

                this.uiControl.changePicture(imagePath)
            }

            if (update['type'] == 'reaction_audio') {
                const audioName = update?.payload?.filename
                const audioPath = `${this.api.config.kaiaServerBaseUrl}/file/${audioName}`

                this.audioControl.playAudio(audioPath)
                return
            }

            // todo: @toplenboren what to do with that?
            // if (element['type'] == 'notification_driver_start') {
            //     initialize_next = true
            // }
        }

        setTimeout(() => this.processUpdates(), 1000)
    }

    async initialize() {
        try {
            const uiControlConfig: IUIControlConfig = {
                chatContainerId: this.config.chatContainerId,
                pictureContainerId: this.config.pictureContainerId
            }

            const uiControl = new UIControl(uiControlConfig)

            const apiConfig: IApiConfig = {
                sessionId: this.config.sessionId,
                kaiaServerBaseUrl: this.config.kaiaServerBaseUrl,
                audioServerBaseUrl: this.config.audioServerBaseUrl,
            }

            const api = new Api(apiConfig)

            const audioControlConfig: Partial<IAudioControlConfig> = {
                wakeword: this.config.wakeword,

                voskModelUrl: this.config.voskModelUrl,

                playSounds: this.config.playSounds || true,
                onWakeword: () => uiControl.addChatMessage('Wakeword detected', { type: 'service' }),

                onStartRecording: () => {
                    uiControl.addChatMessage(`Recording just started`, { type: 'service' })
                },

                onRecordingChunk: async (index: number, audioChunks: Blob[]) => {
                    console.debug(`[kaia] Recording chunk reported: index=${index}, totalChunks=${audioChunks.length}`)
                    await api.uploadAudioChunk(index, audioChunks);
                },

                onStopRecording: async () => {
                    console.debug('[kaia] Stopping recording')
                    const stopRecordingResponse = await api.stopRecording()
                    console.debug('[kaia] Stop recording response:', stopRecordingResponse)  
                    uiControl.addChatMessage(`Recording saved to Kaia server, ${stopRecordingResponse.wav_filename}`, { type: 'service' })
                    if (stopRecordingResponse && stopRecordingResponse.wav_filename) { 
                        const response2 = await api.sendCommandAudio(stopRecordingResponse.wav_filename);
                        console.debug('[kaia] Sent audio command', response2);
                    }
                },

                onAudioPlayEnd: async (path: string) => {
                    console.debug(`[kaia] Audio play ended, ${path} sending confirmation signal`)
                    api.sendConfirmationAudio(path)
                    setTimeout(this.processUpdates.bind(this), 1)
                },

                onVolumeChange: async (volume: number) => {}
            }

            const audioControl = new AudioControl(audioControlConfig)
            await audioControl.initialize()

            this.api = api
            this.audioControl = audioControl
            this.uiControl = uiControl

            // todo @toplenboren add strong typing
            const initializeResponse = await api.commandInitialize()
            console.info('initializeResponse', initializeResponse)

            setTimeout(this.processUpdates.bind(this), 1)

            uiControl.addChatMessage(`Please say: "${this.config.wakeword}" and start talking.. Kaia client_id is ${this.config.sessionId}.`, { type: 'service' })
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

    voskModelUrl: '/vosk-model-small-en-us-0.15.zip',

    chatContainerId: 'chatMessages',
    pictureContainerId: 'pictureDisplay',

    kaiaServerBaseUrl: 'http://localhost:8890',
    audioServerBaseUrl: 'http://localhost:13000',

    ...userConfig
})

export default kaia