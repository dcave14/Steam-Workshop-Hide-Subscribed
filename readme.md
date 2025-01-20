# Steam Workshop Hide Subscribed

A Chrome extension that adds a simple toggle button to hide or show subscribed items in the Steam Workshop, making it easier to discover new content.

## Features

- Adds a "Hide Subscribed" toggle button to Steam Workshop pages
- Remembers your preference between browser sessions
- Works with infinite scroll and sorting
- Seamlessly integrates with Steam's existing UI
- Lightweight and performant

## Installation

### From Chrome Web Store
Coming soon!

### Manual Installation (Developer Mode)
1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked"
5. Select the directory containing the extension files

## Usage

1. Navigate to any Steam Workshop page
2. Look for the "Hide Subscribed" button near the sorting/filtering controls
3. Click to toggle visibility of subscribed items
4. The button will change to "Showing New Items" when subscribed items are hidden

Your preference will be saved automatically and persist between browser sessions.

## How It Works

The extension:
1. Adds a toggle button to Workshop pages
2. Detects subscribed items by checking for subscription indicators
3. Uses Chrome's storage API to remember your preferences
4. Monitors for dynamic content loading to maintain functionality with infinite scroll

## Development

### Project Structure
```
├── manifest.json
├── content.js
└── styles.css
```

### Building
No build step required - this is a simple extension using vanilla JavaScript.

### Testing
1. Make changes to the code
2. Reload the extension in `chrome://extensions`
3. Test on Steam Workshop pages

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

Distributed under the MIT License. See `LICENSE` for more information.

## Contact

dcave14 - [GitHub Profile](https://github.com/dcave14)

## Acknowledgments

- Thanks to the Steam Workshop community for inspiration
- Icon designed by dcave14

## Changelog

### 1.0.0
- Initial release
- Basic hide/show functionality
- Persistent storage of preferences
- Infinite scroll support
