# SceneSync 🎬

A film music scene classifier tool that analyzes audio files to detect scene types (action, romantic, suspense, dramatic, comedy).

## Current Status: Day 1-2 ✅

**React + TypeScript Foundation Setup Complete**

### Features Implemented:
- ✅ React 19 with TypeScript
- ✅ Tailwind CSS for styling
- ✅ Three-column layout:
  - Sidebar navigation
  - Main content area
  - Upload zone (drag & drop)
- ✅ Audio analysis context structure
- ✅ Type definitions for audio/ML features

### Tech Stack:
- **Frontend:** React 19 + TypeScript + Tailwind CSS
- **Audio Processing:** Web Audio API + essentia.js
- **ML Integration:** TensorFlow.js (planned)
- **Backend:** Python/Flask (planned for model serving)

### Project Structure:
scene-sync/
├── src/
│ ├── components/ # React components
│ ├── hooks/ # Custom React hooks
│ ├── types/ # TypeScript definitions
│ ├── utils/ # Utility functions
│ ├── contexts/ # React contexts
│ └── App.tsx # Main application


## Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm start

# Build for production
npm run build