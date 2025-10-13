import { App, Notice, Plugin, PluginSettingTab, Setting, TFile, requestUrl, ItemView } from 'obsidian';

// Интерфейс для хранения наших настроек (только API ключ)
interface ArenaCanvasSettings {
    apiKey: string;
}

// Настройки по умолчанию
const DEFAULT_SETTINGS: ArenaCanvasSettings = {
    apiKey: ''
}

// Основной класс нашего плагина
export default class ArenaCanvasPlugin extends Plugin {
    settings: ArenaCanvasSettings;

    async onload() {
        // Загружаем настройки при старте плагина
        await this.loadSettings();

        // Добавляем страницу настроек
        this.addSettingTab(new ArenaCanvasSettingTab(this.app, this));

        // Регистрируем событие, которое будет следить за изменениями файлов
        // Это основной "слушатель", который запускает наш плагин
        this.registerEvent(
            this.app.vault.on('modify', this.handleFileModify)
        );
    }

    onunload() {
        // Код, который выполнится при отключении плагина
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    // --- ОСНОВНАЯ ЛОГИКА ПЛАГИНА ---

    // Эта функция вызывается каждый раз, когда какой-либо файл в хранилище изменяется
    private handleFileModify = async (file: TFile) => {
        // 1. Убеждаемся, что измененный файл - это Canvas и он сейчас активен
        if (file.extension !== 'canvas') return;
        const activeLeaf = this.app.workspace.getActiveViewOfType(ItemView);
        if (!activeLeaf || activeLeaf.getViewType() !== 'canvas' || activeLeaf.getDisplayText() !== file.basename) {
            return;
        }

        const canvas = (activeLeaf as any).canvas;
        if (!canvas) return;

        const canvasData = canvas.getData();
        let wasModified = false;

        // 2. Ищем ноды (карточки) с нашей командой
        for (const node of canvasData.nodes) {
            if (node.type === 'text' && node.text.startsWith('/arena ')) {
                const query = node.text.replace('/arena ', '').trim();
                if (query.length === 0) continue;

                console.log(`Arena Canvas: Found command for query: ${query}`);
                new Notice(`Searching Are.na for "${query}"...`);

                // 3. Выполняем поиск через API
                const imageUrls = await this.searchArena(query);
                if (imageUrls.length === 0) {
                    new Notice(`No images found for "${query}"`);
                    node.text = `No results: ${query}`; // Изменяем текст, чтобы не искать повторно
                    wasModified = true;
                    continue;
                }

                // 4. Очищаем исходную ноду и создаем новые
                node.text = query; // Заменяем текст в исходной карточке
                
                const parentNode = node;
                const startX = parentNode.x + parentNode.width + 100;
                const startY = parentNode.y;

                for (let i = 0; i < imageUrls.length; i++) {
                    const imageUrl = imageUrls[i];
                    const newNodeId = `arena_${Date.now()}_${i}`; // Более надежный ID

                    // Создаем ноду с картинкой
                    const newNode = {
                        id: newNodeId,
                        type: 'link', // Тип 'link' отлично превьюит изображения по URL
                        url: imageUrl,
                        x: startX + (i % 3) * 320, // Располагаем в сетку 3xN
                        y: startY + Math.floor(i / 3) * 220,
                        width: 300,
                        height: 200,
                    };
                    canvasData.nodes.push(newNode);

                    // Создаем связь (линию) от запроса к картинке
                    const newEdgeId = `edge_${parentNode.id}_${newNode.id}`;
                    const newEdge = {
                        id: newEdgeId,
                        fromNode: parentNode.id,
                        fromSide: 'right',
                        toNode: newNode.id,
                        toSide: 'left',
                    };
                    canvasData.edges.push(newEdge);
                }
                
                wasModified = true;
            }
        }

        // 5. Если были изменения, обновляем Canvas
        if (wasModified) {
            canvas.setData(canvasData);
            canvas.requestSave();
        }
    };

    // Функция для запроса к API Are.na
    private async searchArena(query: string): Promise<string[]> {
        if (!this.settings.apiKey) {
            new Notice("Are.na API key is not set in plugin settings.");
            return [];
        }

        const url = `https://api.are.na/v2/search/blocks?q=${encodeURIComponent(query)}&per=9`;

        try {
            const response = await requestUrl({
                url: url,
                method: 'GET',
                headers: { 'Authorization': `Bearer ${this.settings.apiKey}` }
            });

            const data = response.json;
            if (data.blocks) {
                const imageUrls = data.blocks
                    .filter((block: any) => block.class === 'Image' && block.image)
                    .map((block: any) => block.image.display.url);
                return imageUrls;
            }
            return [];
        } catch (error) {
            console.error("Error fetching from Are.na API:", error);
            new Notice("Failed to fetch from Are.na. Check console for details.");
            return [];
        }
    }
}

// Класс для создания страницы настроек
class ArenaCanvasSettingTab extends PluginSettingTab {
    plugin: ArenaCanvasPlugin;

    constructor(app: App, plugin: ArenaCanvasPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: 'Arena Canvas Settings' });

        new Setting(containerEl)
            .setName('Are.na Personal Access Token')
            .setDesc('You can get this from your Are.na account settings.')
            .addText(text => text
                .setPlaceholder('Enter your API token')
                .setValue(this.plugin.settings.apiKey)
                .onChange(async (value) => {
                    this.plugin.settings.apiKey = value;
                    await this.plugin.saveSettings();
                }));
    }
}