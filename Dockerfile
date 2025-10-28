# Frontend Dockerfile for 13Rooms Angular Application
# Multi-stage build for both development and production

FROM node:20-alpine AS development

RUN apk add --no-cache wget

# Set working directory
WORKDIR /app

# Install Angular CLI globally
RUN npm install -g @angular/cli@20

COPY package.json package-lock.json ./

RUN npm install --verbose

COPY . .

# Expose Angular dev server port
EXPOSE 4200

# Start Angular development server
# --host 0.0.0.0 allows external access to the container
# --poll enables file watching in Docker (required for some systems)
CMD ["ng", "serve", "--host", "0.0.0.0", "--poll", "2000"]

FROM node:20-alpine AS build

WORKDIR /app

RUN npm install -g @angular/cli@20

COPY package.json package-lock.json ./

# Using npm install for more flexibility
# Note: npm install is more forgiving with lock file sync issues
# and will auto-update lock file if needed during development
RUN npm install --verbose

COPY . .

RUN ng build --configuration production

FROM nginx:alpine AS production

# FIXED: Corrected path from '13roomsui' to '13roomsUI' (case-sensitive)
# Angular outputPath from angular.json: "dist/13roomsUI"
COPY --from=build /app/dist/13roomsUI/browser /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
