# 1) Build stage using npm
FROM node:20-alpine AS build
WORKDIR /app

# Copy package files & lockfile, install exact deps
COPY package.json package-lock.json ./
RUN npm ci

# Copy source & build
COPY . .
RUN npm run build

# 2) Serve stage with nginx
FROM nginx:stable-alpine

# Copy custom Nginx config (your existing default.conf)
COPY default.conf /etc/nginx/conf.d/default.conf

# Copy built assets into Nginx html directory
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
