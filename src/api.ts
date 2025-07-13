/**
 * This module handles all api calls to Kaia backend and to audio control backend
 */

export interface IApiConfig {
    sessionId: string,
    audioServerBaseUrl: string,
    kaiaServerBaseUrl: string,
}

export class Api {
    config: IApiConfig

    constructor (config: IApiConfig) {
        this.config = config
    }
    
    async uploadAudioChunk ( index: number, audioChunks: Blob[] ) {
        if (index === undefined || !Array.isArray(audioChunks)) {
            throw new Error('[api] audio chunk index is undefined, or audio chunks is not an array')
        }

        const formData = new FormData()
        formData.append('client_id', this.config.sessionId)
        formData.append('index', index.toString())
        formData.append('blob', new Blob(audioChunks, { type: 'audio/wav' }))
    
        const url = `/audio`;

        return this._sendRequest(url, {
            method: 'POST',
            body: formData
        })
    }

    async sendConfirmationAudio (path: string) {
        const url = `/kaia/command/${this.config.sessionId}/confirmation_audio`;
        const filename = path.split('/').pop()
        return this._sendRequest(url, {
            method: 'POST',
            body: JSON.stringify(filename)
        })
    }

    async sendCommandAudio (filename: string) {
        const url = `/kaia/command/${this.config.sessionId}/command_audio`;
        return this._sendRequest(url, {
            method: 'POST',
            body: JSON.stringify(filename)
        })
    }

    async stopRecording () {
        const formData = new FormData()
        formData.append('client_id', this.config.sessionId)

        const url = `/audio_end`;

        const response = await this._sendRequest(url, {
            method: 'POST',
            body: formData
        })
        console.log('Audio end response:', response)
        return response
    }

    async commandInitialize () {
        const url = `/kaia/command/${this.config.sessionId}/command_initialize`;
        return this._sendRequest(url, {
            method: 'POST',
            body: JSON.stringify('')
        })
    }

    async getUpdates (lastMessageIndex: number) {
        if (lastMessageIndex === undefined) {
            throw new Error('[api] lastMessageId can not be undefined')
        }

        const url = `/kaia/updates/${this.config.sessionId}/${lastMessageIndex.toString()}`;
        return this._sendRequest(url, {
            method: 'GET'
        })
    }

    async _sendRequest (url: string, options: RequestInit) {
        try {
            const defaultHeaders: Record<string, string> = {
                'Accept': 'application/json'
            }

            // Don't set Content-Type for FormData - browser will set it automatically with boundary
            if (!(options?.body instanceof FormData)) {
                defaultHeaders['Content-Type'] = 'application/json; charset=UTF-8'
            }

            const response = await fetch(url, {
                headers: defaultHeaders,
                ...options
            })

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`)
            }

            const contentType = response.headers.get('content-type')
            if (contentType === 'application/json') {
                return await response.json()
            }
            return await response.text()
        } catch (error) {
            console.error(`Error with request to ${url}:`, error)
            throw error
        }
    }
} 