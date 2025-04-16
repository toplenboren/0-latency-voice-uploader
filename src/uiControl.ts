/**
 * This module handles UI interaction
 */

export interface IUIControlConfig {
    chatContainerId: string
    pictureContainerId: string
    placeholderImagePath?: string
}

export class UIControl {
    config
    placeholderImagePath: string

    chatContainer: HTMLElement
    pictureContainer: HTMLImageElement

    constructor(config: IUIControlConfig) {
        this.config = config
        this.placeholderImagePath = config.placeholderImagePath || 'placeholder.svg'

        const chatContainer = document.getElementById(this.config.chatContainerId) as HTMLDivElement
        const pictureContainer = document.getElementById(this.config.pictureContainerId) as HTMLImageElement

        if (!chatContainer || !pictureContainer || !pictureContainer.parentElement) {
            throw new Error ('Chat or picture container failed to initialize')
        }

        this.chatContainer = chatContainer
        this.pictureContainer = pictureContainer
    }

    addChatMessage(message: string, options: { avatar?: string, type: string }) {
        const { type = 'from', avatar } = options;
        
        const messageEl = document.createElement('div');
        messageEl.className = `chat-message ${type} rounded`;

        const contentEl = document.createElement('div');
        contentEl.className = 'chat-content';
        contentEl.textContent = message;

        const avatarEl = document.createElement('div');
        avatarEl.className = 'chat-avatar rounded-circle';
        
        if (avatar) {
            avatarEl.style.backgroundImage = `url(${avatar})`;
        } else {
            switch (type) {
                case 'to':
                    avatarEl.innerHTML = '<i class="bi bi-stars"></i>';
                    break;
                default:
                    avatarEl.innerHTML = '<i class="bi bi-person"></i>';
            }
        }
        
        if (type !== 'service') {
            messageEl.appendChild(avatarEl);
            messageEl.appendChild(contentEl);
        } else {
            messageEl.appendChild(contentEl);
        }
        
        this.chatContainer.appendChild(messageEl);
        this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
    }

    changePicture(pictureUrl: string) {
        if (!this.pictureContainer || !this.pictureContainer.src || !this.pictureContainer.parentElement) {
            throw new Error ('Chat or picture container failed to initialize')
        }

        this.pictureContainer.src = pictureUrl
    }

    clearChat() {
        if (!this.chatContainer) {
            throw new Error('Chat container failed to initialize')
        }

        while (this.chatContainer.firstChild) {
            this.chatContainer.removeChild(this.chatContainer.firstChild)
        }
    }

    clearPicture() {
        if (!this.pictureContainer || !this.pictureContainer.parentElement) {
            throw new Error('Picture container failed to initialize')
        }

        this.pictureContainer.src = this.placeholderImagePath
    }
}