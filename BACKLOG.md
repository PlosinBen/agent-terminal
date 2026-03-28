# Backlog — Nice-to-Have Improvements

Features that are not critical but would improve the experience.

## Agent View

- **Image thumbnails in user messages**: When user sends images with a query, display small thumbnails in the user message bubble so they can confirm what was sent. Requires storing image data URLs in the `Message` type and rendering `<img>` elements in MessageList.

## Input

- **File path paste**: When pasting files from Finder/IDE into the textarea, convert to relative file paths (strip project cwd prefix). Currently blocked by clipboard limitations — Electron `File.path` is undefined for IDE-copied files, and `text/uri-list` is not used by all apps.
