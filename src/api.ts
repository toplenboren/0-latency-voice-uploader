/**
 * This module handles all api calls to Kaia backend
 */

export interface IApiConfig {
    sessionId: string,
    audioServerBaseUrl: string,
    kaiaServerBaseUrl: string,
}

export class Api {
    sessionId: string
    audioServerBaseUrl: string
    kaiaServerBaseUrl: string

    constructor(config: IApiConfig) {
        this.audioServerBaseUrl = config.audioServerBaseUrl
        this.kaiaServerBaseUrl = config.kaiaServerBaseUrl
        this.sessionId = config.sessionId
    }
    
    async uploadAudioChunk( index: string, audioChunks: Blob[] ) {
        if (index === undefined || !Array.isArray(audioChunks)) {
            throw new Error('[api] audio chunk index is undefined, or audio chunks is not an array')
        }

        const formData = new FormData();
        formData.append('client_id', this.sessionId);
        formData.append('index', index);
        formData.append('blob', new Blob(audioChunks, { type: 'audio/wav' }));
    
        const url = this.audioServerBaseUrl + '/audio'

        return this._sendRequest(url, {
            method: 'POST',
            body: formData
        });
    }

    async sendConfirmationAudio(path) {
        const url = `${this.kaiaServerBaseUrl}/command/${this.sessionId}/confirmation_audio`

        const filename = path.split('/').pop()

        return this._sendRequest(url, {
            method: 'POST',
            body: JSON.stringify(filename)
        })
    }

    async sendCommandAudio(filename: string) {
        const url = `${this.kaiaServerBaseUrl}/command/${this.sessionId}/command_audio`

        return this._sendRequest(url, {
            method: 'POST',
            body: JSON.stringify(filename)
        })
    }

    async stopRecording() {
        const formData = new FormData();
        formData.append('client_id', this.sessionId);

        const url = this.audioServerBaseUrl + '/audio_end'

        const response = await this._sendRequest(url, {
            method: 'POST',
            body: formData
        });
        console.log('Audio end response:', response);
        return response;
    }

    async commandInitialize() {
        const url = `${this.kaiaServerBaseUrl}/command/${this.sessionId}/command_initialize`

        return this._sendRequest(url, {
            method: 'POST',
            body: JSON.stringify('')
        })
    }

    async getUpdates(lastMessageId: string) {
        if (lastMessageId === undefined) {
            throw new Error('[api] lastMessageId can not be undefined')
        }

        const url = `${this.kaiaServerBaseUrl}/updates/${this.sessionId}/${lastMessageId}`

        return this._sendRequest(url, {
            method: 'GET'
        });
    }

    async _sendRequest(url: string, options: any) {
        try {
            const defaultHeaders = {
                'Accept': 'application/json'
            }

            // Don't set Content-Type for FormData - browser will set it automatically with boundary
            if (!(options?.body instanceof FormData)) {
                // @ts-ignore
                defaultHeaders['Content-Type'] = 'application/json; charset=UTF-8'
            }

            const response = await fetch(url, {
                headers: defaultHeaders,
                ...options
            })

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const contentType = response.headers.get('content-type');
            if (contentType === 'application/json') {
                return await response.json();
            }
            return await response.text();
        } catch (error) {
            console.error(`Error with request to ${url}:`, error);
            throw error;
        }
    }
} 