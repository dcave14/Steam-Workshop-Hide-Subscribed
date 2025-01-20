# Steam Workshop Hide Subscribed

A Chrome extension that adds filtering capabilities to Steam Workshop pages, allowing you to hide subscribed items and filter by star rating to easily discover new high-quality content.

## Preview

![Recording 2025-01-19 at 23 32 55](https://github.com/user-attachments/assets/b603887e-80a5-48be-99b3-691ac6763c20)

*Use the filters to quickly find new, highly-rated Workshop content.*

## Features

- Toggle button to hide/show subscribed items
- Star rating filter (5 stars only, 4+ stars, etc.)
- Remembers your preferences between browser sessions
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
2. Find the filtering controls near the sorting options:
   - "Hide Subscribed" button to toggle visibility of subscribed items
   - "Star Rating" dropdown to filter by minimum star rating
3. Your selections will be saved automatically and persist between sessions

## How It Works

The extension:
1. Adds filtering controls to Workshop pages
2. Detects subscribed items and star ratings
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

## Changelog

### 1.1.0
- Added star rating filter
- UI improvements with dropdown menu
- Enhanced filter persistence
- Fixed issues with dynamic content loading

### 1.0.0
- Initial release
- Basic hide/show functionality
- Persistent storage of preferences
- Infinite scroll support