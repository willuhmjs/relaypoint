# Use a Node.js base image
FROM node:22-alpine

# Set the working directory
WORKDIR /app

ENV PRISMA_HIDE_UPDATE_MESSAGE=1
ENV PRISMA_DISABLE_WARNINGS=1

# Copy package.json and package-lock.json
COPY package.json package-lock.json ./

RUN apk add poppler-data poppler-utils

# copy database schema https://github.com/prisma/prisma/discussions/19669#discussioncomment-11884582
COPY prisma/schema.prisma ./

# Install dependencies
RUN npm ci
RUN npx prisma generate

COPY . .

# Build the SvelteKit app
RUN npm run build

# Expose the port the app runs on
EXPOSE 3000

COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

RUN chown -R 1000:1000 /app

USER 1000

ENTRYPOINT ["./entrypoint.sh"]

