FROM node:22-alpine

ENV TZ=UTC \
    NODE_ENV=production

WORKDIR /app

# Install production deps from the lockfile (reproducible builds)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src

# Don't run as root
USER node

# Railway injects PORT; 3001 is the local default
EXPOSE 3001

CMD ["node", "src/index.js"]
