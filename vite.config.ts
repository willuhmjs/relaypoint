import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { webSocketPlugin } from './src/lib/server/webSocketPlugin'; // Import the new plugin

export default defineConfig({
	plugins: [
		sveltekit(),
		tailwindcss(),
		webSocketPlugin // Add the WebSocket plugin back here
	],
	// This ensures the server listens on all network interfaces,
	// which can be helpful for testing on different devices.
	server: {
		host: '0.0.0.0'
	}
});