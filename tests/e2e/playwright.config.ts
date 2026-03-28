import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: '.',
	timeout: 60000,
	expect: { timeout: 10000 },
	use: {
		baseURL: process.env.N8N_URL || 'http://localhost:5678',
		trace: 'on-first-retry',
	},
	projects: [
		{
			name: 'chromium',
			use: { browserName: 'chromium' },
		},
	],
});
