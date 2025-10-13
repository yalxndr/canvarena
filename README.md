# Arena Canvas for Obsidian

![Arena Canvas Demo](https://i.imgur.com/YOUR_GIF_URL.gif)  <!-- TODO: Replace with your actual GIF URL -->

Arena Canvas is an Obsidian plugin that brings inspiration from [Are.na](https://www.are.na) directly into your Obsidian Canvas. Simply type a command, and the plugin will search for images on Are.na and automatically populate your canvas with the results, connecting them to your original idea.

## How It Works

1.  You create a text node in an Obsidian Canvas.
2.  You type the trigger command `/arena` followed by your search query (e.g., `/arena brutalist architecture`).
3.  Click away from the node to save it.
4.  The plugin instantly fetches images from Are.na, creates new link nodes for each image, and connects them to your original text node.

This allows for rapid, visual brainstorming sessions powered by the vast archive of Are.na.

## How to Use

### 1. Installation

1.  Install the plugin from the Obsidian Community Plugins browser.
2.  Enable the plugin in your Obsidian settings.

### 2. Configuration

Before you can use the plugin, you need to provide your Are.na Personal Access Token.

1.  Go to the Are.na developer settings page: `https://dev.are.na/oauth/applications`.
2.  Create a new application or find an existing one.
3.  Copy your **Personal Access Token**.
4.  Open Obsidian Settings, go to **Plugin Options -> Arena Canvas**, and paste your token into the "Are.na Personal Access Token" field.

### 3. Usage in Canvas

1.  Create a new or open an existing Canvas file in Obsidian.
2.  Create a new text node (drag and drop a text file or create a card).
3.  In the text node, type `/arena` followed by what you want to search for. For example:
    *   `/arena vintage cars`
    *   `/arena film photography`
    *   `/arena abstract gradients`
4.  Click anywhere else on the canvas. The plugin will replace the command text with your search query and generate the image nodes.

## Contributing

This is an open-source project. If you'd like to contribute, please feel free to open an issue or submit a pull request.

## License

This plugin is licensed under the [MIT License](LICENSE).