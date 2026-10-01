# Steam Workshop Filter Plus

A Chrome extension that adds filtering capabilities to Steam Workshop pages, allowing you to hide subscribed items and filter by star rating to easily discover new high-quality content.

## Preview

![Recording 2025-01-20 at 06 23 52](https://github.com/user-attachments/assets/c705f6af-d6c7-4c66-a2fc-b948faa6ad53)
*Use the filters to quickly find new, highly-rated Workshop content.*

## Features

- Toggle button to hide/show subscribed items
- Star rating filter (5 stars only, 4+ stars, etc.)
- Remembers your preferences between browser sessions
- Seamlessly integrates with Steam's existing UI
- Supports both the classic Workshop layout and Steam's new React SSR Workshop layout
  (CommunityTemplate pages such as `steamcommunity.com/app/*/workshop/*`)
- Supports classic collection pages (`steamcommunity.com/sharedfiles/filedetails/?id=<collectionid>`):
  the controls join the collection's own 3-button row and match its native `.general_btn` styling
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

1. Navigate to any Steam Workshop page (classic pages, `steamcommunity.com/workshop/*`,
   classic collection pages such as `steamcommunity.com/sharedfiles/filedetails/?id=<collectionid>`,
   or the new layout pages such as `steamcommunity.com/app/*/workshop/*`)
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

On Steam's new React SSR Workshop layout (CommunityTemplate) the original item selectors
no longer exist, so the extension uses stable structural hooks instead of hashed class
names. Subscribed state is not part of the server-rendered HTML there: the page requests
it from `/sharedfiles/actions?q=GetUserListStatus`, and the extension observes those
requests (plus replays them for uncached items) to learn which cards are subscribed.
Star ratings come from the card's star icons with the SSR `window.SSR` data
island (`star_rating` by publishedfileid) as a fallback.

## Development

### Project Structure
```
├── manifest.json
├── steam-dom.js
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

### Unreleased
- Added the filters to classic collection pages (`sharedfiles/filedetails/?id=<collectionid>`),
  where the controls join the collection's native button row and use its `.general_btn` styling
- Rebuilt the injected controls in Steam's native style and placed them immediately left of the native sort button, with all three buttons sized to the mod card width and flush with the card columns below
- The three controls now use one uniform 13px font and a frozen worst-case label width, so their geometry stays identical when the sort order or filter labels change

### 1.3.0
- Added support for Steam's new React SSR Workshop layout (CommunityTemplate), including
  `steamcommunity.com/app/*/workshop/*` pages: structural card detection, subscribed
  state via observed/replayed `GetUserListStatus` queries, star counting and injected
  controls in the new filter row
- Kept the classic Workshop layout support unchanged

### 1.2.0
- Added support for multiple item types (collection, workshop item, etc.)
- Improved filter logic to handle different item structures

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
