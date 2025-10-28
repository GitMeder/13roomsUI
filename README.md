# 13roomsUI

This is the Angular 20 frontend application for the 13Rooms room booking system.

## Current Status

The booking form has been implemented, allowing users to book rooms. The UI has been enhanced for a better user experience. The latest code has been pushed to the GitHub repository.

## Getting Started with Docker (Recommended)

The easiest way to run the frontend is using Docker. This setup automatically configures API proxying to the backend.

### Prerequisites

- Docker Desktop installed and running
  - Windows/Mac: [Download Docker Desktop](https://www.docker.com/products/docker-desktop)
  - Linux: [Install Docker Engine](https://docs.docker.com/engine/install/)
- **Backend API must be running** on http://localhost:3000

### Important: Start Backend First

Before starting the frontend, make sure the backend is running:

```bash
# In a separate terminal, navigate to the backend directory
cd 13roomsAPI
docker compose up --build

# Wait for the message: "Server running on port 3000"
```

### Quick Start

1. **Navigate to the frontend directory:**

   ```bash
   cd 13roomsUI
   ```

2. **Start the frontend with one command:**

   ```bash
   docker compose up --build
   ```

3. **Wait for startup** (takes 1-2 minutes on first run)

   You'll see messages like:

   ```
   ✔ Container 13rooms-ui-frontend  Started
   ✔ Compiled successfully
   ```

4. **Access the application:**

   Open your browser and navigate to:
   - Frontend: http://localhost:4200

### How API Proxying Works

The frontend is configured to automatically proxy all `/api` requests to the backend running on `http://localhost:3000`. This means:

- Frontend makes request to: `http://localhost:4200/api/rooms`
- Proxy forwards it to: `http://localhost:3000/api/rooms`
- No CORS issues!

The proxy configuration is in `proxy.conf.json`.

### Stopping the Services

Press `Ctrl+C` in the terminal, or run:

```bash
docker compose down
```

### What Gets Started?

The Docker setup includes:

- **Angular 20 Frontend**
  - Port: 4200
  - Hot-Module-Replacement for instant updates
  - Live-reload (changes to code automatically refresh the browser)
  - API proxy configured to backend

---

## Manual Development (Without Docker)

### Development server

Run `ng serve` for a dev server. Navigate to `http://localhost:4200/`. The application will automatically reload if you change any of the source files.

## Code scaffolding

Run `ng generate component component-name` to generate a new component. You can also use `ng generate directive|pipe|service|class|guard|interface|enum|module`.

## Build

Run `ng build` to build the project. The build artifacts will be stored in the `dist/` directory.

## Running unit tests

Run `ng test` to execute the unit tests via [Karma](https://karma-runner.github.io).

## Running end-to-end tests

Run `ng e2e` to execute the end-to-end tests via a platform of your choice. To use this command, you need to first add a package that implements end-to-end testing capabilities.

## Further help

To get more help on the Angular CLI use `ng help` or go check out the [Angular CLI Overview and Command Reference](https://angular.io/cli) page.
