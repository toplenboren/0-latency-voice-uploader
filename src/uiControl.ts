/**
 * This module handles UI interaction
 */

export interface IUIControlConfig {
    chatContainerId: string
    pictureContainerId: string
}

export class UIControl {
    config

    chatContainer: HTMLElement
    pictureContainer: HTMLElement

    constructor(config: IUIControlConfig) {
        this.config = config

        const chatContainer = document.getElementById(this.config.chatContainerId);
        const pictureContainer = document.getElementById(this.config.pictureContainerId);

        if (!chatContainer || !pictureContainer) {
            throw new Error ('Chat or picture container failed to initialize')
        }
        
        // Add placeholder for the main picture container
        const placeholder = document.createElement('div');
        placeholder.className = 'picture-placeholder';
        placeholder.innerHTML = '<i class="bi bi-robot"></i>';
        // todo: @toplenboren fix this
        // @ts-ignore
        pictureContainer.parentElement.appendChild(placeholder);

        this.chatContainer = chatContainer
        this.pictureContainer = pictureContainer
    }

    addChatMessage (message: string, options: { type: 'from'|'to'|'service', avatar?: string }) {
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

        // @ts-ignore
        this.pictureContainer.src = pictureUrl;
        // @ts-ignore
        const placeholder = this.pictureContainer.parentElement.querySelector('.picture-placeholder');
        if (pictureUrl) {
            // @ts-ignore
            placeholder.style.display = 'none';
        } else {
            // @ts-ignore
            placeholder.style.display = 'flex';
        }
    }
}