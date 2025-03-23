/**
 * This module handles UI interaction
 */

export interface IUIControlConfig {
    chatContainerId: string
    pictureContainerId: string
}

export class UIControl {
    chatContainer: HTMLElement
    pictureContainer: HTMLElement

    constructor(userConfig: IUIControlConfig) {
        const config = {
            chatContainerId: 'chatMessages',
            pictureContainerId: 'pictureDisplay',
            
            ...userConfig
        };

        this.chatContainer = document.getElementById(config.chatContainerId);
        this.pictureContainer = document.getElementById(config.pictureContainerId);
        
        // Add placeholder for the main picture container
        const placeholder = document.createElement('div');
        placeholder.className = 'picture-placeholder';
        placeholder.innerHTML = '<i class="bi bi-robot"></i>';
        this.pictureContainer.parentElement.appendChild(placeholder);
    }

    addChatMessage (message: string, options: { type: 'from'|'to'|'service', avatar: string }) {
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

    changePicture(pictureUrl) {
        // @ts-ignore
        this.pictureContainer.src = pictureUrl;
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