import { App, Notice, Plugin, PluginSettingTab, Setting, TFile, requestUrl, ItemView } from 'obsidian';

// --- ИНТЕРФЕЙСЫ ---

interface ArenaCanvasSettings { 
    apiKey: string;
    collectionJumps: number;
}
const DEFAULT_SETTINGS: ArenaCanvasSettings = { 
    apiKey: '',
    collectionJumps: 20
}

// ИЗМЕНЕНО: Более точный тип для Canvas, описывающий только то, что мы используем
interface Canvas {
    selection: Map<string, any>;
    getData(): CanvasData;
    setData(data: CanvasData): void;
    requestSave(): void;
}

interface CanvasView extends ItemView { 
    canvas: Canvas; 
}

interface ArenaBlock { id: number; class: 'Image' | 'Text' | 'Link' | 'Attachment' | 'Channel'; title: string; image?: { display: { url: string; } }; }
interface ArenaConnection { id: number; title: string; }
interface CanvasNodeData { id: string; x: number; y: number; width: number; height: number; type: 'text' | 'link' | 'file'; text?: string; url?: string; }

// ИЗМЕНЕНО: Добавляем тип для ребер (edges)
interface CanvasEdgeData {
    id: string;
    fromNode: string;
    fromSide: 'top' | 'right' | 'bottom' | 'left';
    toNode: string;
    toSide: 'top' | 'right' | 'bottom' | 'left';
}

interface CanvasData { 
    nodes: CanvasNodeData[]; 
    edges: CanvasEdgeData[]; // Используем новый тип
}

// --- ОСНОВНОЙ КЛАСС ПЛАГИНА ---

export default class ArenaCanvasPlugin extends Plugin {
    settings: ArenaCanvasSettings;

    async onload() {
        await this.loadSettings();
        this.addSettingTab(new ArenaCanvasSettingTab(this.app, this));
        this.registerEvent(this.app.vault.on('modify', this.handleFileModify));
    }

    onunload() {}
    async loadSettings() { this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData()); }
    async saveSettings() { await this.saveData(this.settings); }

    private handleFileModify = async (file: TFile) => {
        if (file.extension !== 'canvas') return;
        const activeLeaf = this.app.workspace.getActiveViewOfType(ItemView);
        if (!activeLeaf || activeLeaf.getViewType() !== 'canvas') return;
        
        const canvas = (activeLeaf as CanvasView).canvas;
        if (!canvas) return;

        const activeNode = canvas.selection?.values()?.next()?.value;
        if (!activeNode || !activeNode.text || !activeNode.text.includes('\n')) {
            return;
        }

        const commandText = activeNode.text.replace(/\n$/, '').trim();
        let wasModified = false;
        
        const canvasData: CanvasData = canvas.getData();
        
        if (commandText.startsWith('/collect ')) {
            const triggerNode = canvasData.nodes.find((n: CanvasNodeData) => n.id === activeNode.id);
            if(triggerNode) {
                wasModified = await this.handleCollectCommand(triggerNode, canvasData, commandText);
            }
        }
        
        if (wasModified) {
            canvas.setData(canvasData);
            canvas.requestSave();
        }
    };
    
    private async handleCollectCommand(triggerNode: CanvasNodeData, canvasData: CanvasData, commandText: string): Promise<boolean> {
        const query = commandText.replace('/collect ', '').trim();
        if (query.length === 0) {
            new Notice("Please provide a starting query for /collect.");
            return false;
        }

        new Notice(`Starting collection for "${query}"...`);
        let currentBlock: ArenaBlock | null = await this.findFirstImageBlock(query);

        if (!currentBlock) {
            new Notice(`Could not find an initial block for "${query}".`);
            triggerNode.text = `No results: ${query}`;
            return true;
        }

        triggerNode.text = `Collection started with:\n${query}`;
        let previousNodeOnCanvas = triggerNode;

        for (let i = 0; i < this.settings.collectionJumps; i++) {
            if (!currentBlock) {
                new Notice("Stopping collection due to an unexpected error.");
                break;
            }

            new Notice(`Collecting... Step ${i + 1}/${this.settings.collectionJumps}`);
            
            const currentNodeOnCanvas = this.createNodeFromBlock(currentBlock, previousNodeOnCanvas.x, previousNodeOnCanvas.y + previousNodeOnCanvas.height + 120);
            canvasData.nodes.push(currentNodeOnCanvas);
            canvasData.edges.push({ id: `edge_${previousNodeOnCanvas.id}_${currentNodeOnCanvas.id}`, fromNode: previousNodeOnCanvas.id, fromSide: 'bottom', toNode: currentNodeOnCanvas.id, toSide: 'top' });

            const connections: ArenaConnection[] = await this.getBlockConnections(currentBlock.id);
            if (connections.length === 0) {
                new Notice("Reached a dead end (no connections). Stopping collection.");
                break;
            }
            await this.updateConnectionsFile(currentBlock.title, connections);
            
            const randomConnection: ArenaConnection = connections[Math.floor(Math.random() * connections.length)];
            
            const channelBlocks: ArenaBlock[] = await this.getChannelContents(randomConnection.id);
            if (channelBlocks.length === 0) {
                new Notice(`Channel "${randomConnection.title}" is empty. Stopping collection.`);
                break;
            }
            
            const nextBlock: ArenaBlock = channelBlocks[Math.floor(Math.random() * channelBlocks.length)];
            
            currentBlock = nextBlock;
            previousNodeOnCanvas = currentNodeOnCanvas;
        }

        new Notice("Collection complete!");
        return true;
    }

    private createNodeFromBlock(block: ArenaBlock, x: number, y: number, width = 300, height = 250): CanvasNodeData {
        const baseNode = { id: `block_${block.id}_${Date.now()}`, x, y, width, height };
        if (block.class === 'Image' && block.image) {
            return { ...baseNode, type: 'link', url: block.image.display.url };
        }
        return { ...baseNode, type: 'text', text: block.title || 'Untitled Block' };
    }

    private async getChannelContents(channelId: number): Promise<ArenaBlock[]> {
        if (!this.settings.apiKey) return [];
        const url = `https://api.are.na/v2/channels/${channelId}/contents?per=50`;
        try {
            const response = await requestUrl({ url, method: 'GET', headers: { 'Authorization': `Bearer ${this.settings.apiKey}` } });
            return response.json.contents as ArenaBlock[] || [];
        } catch (error) {
            console.error(`Error fetching contents for channel ${channelId}:`, error);
            return [];
        }
    }

    private async updateConnectionsFile(query: string, connections: ArenaConnection[]): Promise<void> {
        if (connections.length === 0) return;
        const folderName = 'Canvarena';
        const fileName = 'Connections.md';
        const filePath = `${folderName}/${fileName}`;
        const tags = connections.map(c => `#${c.title.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')}`).join(' ');
        const newEntry = `\n[[${query}]]\n${tags}\n`;
        try {
            if (!await this.app.vault.adapter.exists(folderName)) {
                await this.app.vault.createFolder(folderName);
            }
            const file = this.app.vault.getAbstractFileByPath(filePath);
            if (file instanceof TFile) {
                await this.app.vault.append(file, newEntry);
            } else {
                await this.app.vault.create(filePath, newEntry.trim());
            }
        } catch (error) {
            console.error("Canvarena: Error updating connections file:", error);
            // ИЗМЕНЕНО: Sentence case
            new Notice("Could not update connections.md file.");
        }
    }

    private async findFirstImageBlock(query: string): Promise<ArenaBlock | null> {
        if (!this.settings.apiKey) { new Notice("Are.na API key is not set in plugin settings."); return null; }
        const url = `https://api.are.na/v2/search/blocks?q=${encodeURIComponent(query)}&per=10`;
        try {
            const response = await requestUrl({ url, method: 'GET', headers: { 'Authorization': `Bearer ${this.settings.apiKey}` } });
            const data = response.json;
            if (data.blocks && data.blocks.length > 0) return data.blocks.find((block: ArenaBlock) => block.class === 'Image' && block.image) || data.blocks[0];
            return null;
        } catch (error) { console.error("Error searching Are.na:", error); return null; }
    }

    private async getBlockConnections(blockId: number): Promise<ArenaConnection[]> {
        if (!this.settings.apiKey) return [];
        const url = `https://api.are.na/v2/blocks/${blockId}`;
        try {
            const response = await requestUrl({ url, method: 'GET', headers: { 'Authorization': `Bearer ${this.settings.apiKey}` } });
            return response.json.connections || [];
        } catch (error) { console.error(`Error fetching connections for block ${blockId}:`, error); return []; }
    }
}

class ArenaCanvasSettingTab extends PluginSettingTab {
    plugin: ArenaCanvasPlugin;
    constructor(app: App, plugin: ArenaCanvasPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        
        // ИЗМЕНЕНО: Заменяем h2 на setHeading() и используем Sentence case
        new Setting(containerEl)
            .setName('Canvarena settings')
            .setHeading();

        new Setting(containerEl)
            // ИЗМЕНЕНО: Sentence case
            .setName('Are.na personal access token')
            .setDesc('You can get this from your Are.na account settings.')
            .addText(text => text
                .setPlaceholder('Enter your API token')
                .setValue(this.plugin.settings.apiKey)
                .onChange(async (value) => {
                    this.plugin.settings.apiKey = value;
                    await this.plugin.saveSettings();
                }));
        
        new Setting(containerEl)
            // ИЗМЕНЕНО: Sentence case
            .setName('Collection jumps')
            .setDesc('How many steps the /collect command should take to gather data.')
            .addText(text => text
                .setValue(String(this.plugin.settings.collectionJumps))
                .onChange(async (value) => {
                    const numValue = parseInt(value, 10);
                    if (!isNaN(numValue) && numValue > 0) {
                        this.plugin.settings.collectionJumps = numValue;
                        await this.plugin.saveSettings();
                    }
                }));

        new Setting(containerEl)
            // ИЗМЕНЕНО: Sentence case
            .setName('Import dictionary')
            // ИЗМЕНЕНО: Sentence case
            .setDesc('Import a .txt file with one term per line to build your semantic dictionary (im_connections.md).')
            .addButton(button => {
                button.setButtonText('Upload .txt file')
                    .onClick(() => {
                        const input = createEl('input', { type: 'file', attr: { accept: '.txt' } });
                        input.onchange = async (e) => {
                            const file = (e.target as HTMLInputElement).files?.[0];
                            if (!file) return;

                            const content = await file.text();
                            const lines = content.split('\n').filter(line => line.trim() !== '');
                            const taggedContent = lines.map(line => `#${line.trim()}`).join('\n');

                            const folderName = 'Canvarena';
                            const fileName = 'Im_connections.md';
                            const filePath = `${folderName}/${fileName}`;

                            try {
                                if (!await this.app.vault.adapter.exists(folderName)) {
                                    await this.app.vault.createFolder(folderName);
                                }
                                const fileExists = await this.app.vault.adapter.exists(filePath);
                                if (fileExists) {
                                    const existingContent = await this.app.vault.adapter.read(filePath);
                                    await this.app.vault.adapter.write(filePath, existingContent + '\n' + taggedContent);
                                    new Notice(`Dictionary updated in ${filePath}`);
                                } else {
                                    await this.app.vault.create(filePath, taggedContent);
                                    new Notice(`Dictionary created at ${filePath}`);
                                }
                            } catch (err) {
                                // ИЗМЕНЕНО: Sentence case
                                new Notice('Error importing dictionary. Check console.');
                                console.error('Dictionary import error:', err);
                            }
                        };
                        input.click();
                    });
            });
    }
}