import { UIControl, IUIControlConfig } from './uiControl';
import { Api, IApiConfig } from './api.js';
import { AudioControl, IAudioControlConfig } from './audioControl.js';

interface IKaiaConfig {
    sessionId?: string

    wakeword?: string
    voskModelUrl?: string

    chatContainerId?: string
    pictureContainerId?: string,

    apiConfig: IApiConfig,
    audioControlConfig: IAudioControlConfig,
    uiControlConfig: IUIControlConfig,
}

class KaiaApp {
    wakeword: string
    sessionId: string

    config: IKaiaConfig

    uiControl: UIControl
    api: Api
    audioControl: AudioControl

    constructor(config: IKaiaConfig) {
        const wakeword = config?.wakeword || 'computer'
        const sessionId = config?.sessionId || Math.floor(Math.random() * 1000000).toString()

        this.userConfig = {
            uiControl: {
                chatContainerId: config?.chatContainerId || 'chatMessages',
                pictureContainerId: config?.pictureContainerId || 'pictureDisplay',
            },
            api: {},
            audioControl: {
                wakeword: wakeword,
                voskModelUrl: config?.voskModelUrl || '/vosk-model-small-en-us-0.15.zip',
            }
        };
        
        this.uiControl = null;
        this.audioControl = null;
        this.api = null;

        this.wakeword = wakeword
        this.sessionId = sessionId
    }

    async processUpdates () {
        const updates = await this.api.getUpdates(this.lastMessageId)
        
        for (const update of updates) {
            if (update.id > this.lastMessageId) {
                this.lastMessageId = update.id
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
            this.uiControl = new UIControl(this.userConfig.uiControl)

            this.api = new Api( { 
                ...this.userConfig.api,
                kaiaClientId: this.clientId,
            })

            const audioControlConfig = {
                playSounds: true,
                onWakeword: () => this.uiControl.addChatMessage('Wakeword detected', { type: 'service' }),

                onStartRecording: () => {
                    this.uiControl.addChatMessage(`Recording just started`, { type: 'service' })
                },

                onRecordingChunk: async (index, audioChunks) => {
                    console.debug(`[kaia] Recording chunk reported: index=${index}, totalChunks=${audioChunks.length}`)
                    await this.api.uploadAudioChunk({ index, audioChunks });
                },

                onStopRecording: async () => {
                    console.debug('[kaia] Stopping recording')
                    const stopRecordingResponse = await this.api.stopRecording()       
                    console.debug('[kaia] Stop recording response:', stopRecordingResponse)  
                    this.uiControl.addChatMessage(`Recording saved to Kaia server, ${stopRecordingResponse.wav_filename}`, { type: 'service' }) 
                    if (stopRecordingResponse && stopRecordingResponse.wav_filename) { 
                        const response2 = await this.api.sendCommandAudio(stopRecordingResponse.wav_filename); 
                        console.debug('[kaia] Sent audio command', response2);
                    }   

                },

                onAudioPlayEnd: async (path) => {
                    console.debug(`[kaia] Audio play ended, ${path} sending confirmation signal`)
                    this.api.sendConfirmationAudio(path)
                    setTimeout(this.processUpdates.bind(this), 1)
                },

                onVolumeChange: async (volume) => {}
            }
            this.audioControl = new AudioControl({ 
                ...this.config.audioControl,
                ...audioControlConfig
             })
            await this.audioControl.initialize()

            // todo @toplenboren add strong typing
            const initializeResponse = await this.api.commandInitialize()
            console.info('initializeResponse', initializeResponse)

            this.lastMessageId = 0 // todo @toplenboren what if I want to continue my dialog?
            setTimeout(this.processUpdates.bind(this), 1)

            this.uiControl.addChatMessage(`Please say: "${this.wakeword}" and start talking.. Kaia client_id is ${this.sessionId}.`, { type: 'service' })
        } catch (error) {
            console.error('[kaia] Failed to initialize Kaia:', error)
        }
    }
}

const kaia = new KaiaApp();

// kaia is singleton
export { kaia as default }; 