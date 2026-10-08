#!/usr/bin/env tsx
/**
 * Interactive CLI to promote an existing user to ADMIN (or OWNER).
 * Usage: tsx scripts/promote-admin.ts
 *
 * Requires DATABASE_URL in the environment or a .env file in the project root.
 */

import { readFileSync } from 'fs';
import { createInterface } from 'readline';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Client } from 'pg';

// --- Load .env from project root ---
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '.env');
try {
	const envFile = readFileSync(envPath, 'utf-8');
	for (const line of envFile.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;
		const eqIdx = trimmed.indexOf('=');
		if (eqIdx === -1) continue;
		const key = trimmed.slice(0, eqIdx).trim();
		let value = trimmed.slice(eqIdx + 1).trim();
		// Strip surrounding quotes
		if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
			value = value.slice(1, -1);
		}
		// Expand ${VAR} references using already-set env vars
		value = value.replace(/\$\{([^}]+)\}/g, (_, v) => process.env[v] ?? '');
		if (!(key in process.env)) process.env[key] = value;
	}
} catch {
	// No .env file — rely on environment variables already being set
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL || DATABASE_URL.includes('dummy')) {
	console.error('ERROR: DATABASE_URL is not set or is a placeholder. Check your .env file.');
	process.exit(1);
}

const ROLES = ['ADMIN', 'OWNER', 'USER'] as const;
type Role = (typeof ROLES)[number];

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q: string): Promise<string> => new Promise((res) => rl.question(q, res));

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';

async function main() {
	const client = new Client({ connectionString: DATABASE_URL });
	await client.connect();

	try {
		console.log(`\n${BOLD}${CYAN}Relaypoint — User Role Manager${RESET}\n`);

		// Fetch all users
		const { rows: users } = await client.query<{
			id: string;
			name: string | null;
			email: string | null;
			role: Role;
		}>('SELECT id, name, email, role FROM "User" ORDER BY role, email');

		if (users.length === 0) {
			console.log(`${YELLOW}No users found in the database.${RESET}`);
			return;
		}

		// Display user table
		console.log(`${BOLD}Existing users:${RESET}\n`);
		const colW = { idx: 4, name: 24, email: 36, role: 8 };
		const header =
			`  ${'#'.padEnd(colW.idx)}` +
			`${'Name'.padEnd(colW.name)}` +
			`${'Email'.padEnd(colW.email)}` +
			`Role`;
		console.log(`${BOLD}${header}${RESET}`);
		console.log(DIM + '-'.repeat(header.length) + RESET);

		users.forEach((u, i) => {
			const roleColor = u.role === 'OWNER' ? YELLOW : u.role === 'ADMIN' ? GREEN : RESET;
			console.log(
				`  ${String(i + 1).padEnd(colW.idx)}` +
					`${(u.name ?? '(no name)').slice(0, colW.name - 2).padEnd(colW.name)}` +
					`${(u.email ?? '(no email)').slice(0, colW.email - 2).padEnd(colW.email)}` +
					`${roleColor}${u.role}${RESET}`
			);
		});

		console.log();

		// Select user
		const selection = (await ask(`${BOLD}Select user by number or email: ${RESET}`)).trim();
		rl.write('');

		let target = users.find((u) => u.email === selection);
		if (!target) {
			const idx = parseInt(selection, 10) - 1;
			if (!isNaN(idx) && idx >= 0 && idx < users.length) {
				target = users[idx];
			}
		}

		if (!target) {
			console.error(`\n${RED}No user matched "${selection}". Aborting.${RESET}\n`);
			return;
		}

		console.log(
			`\nSelected: ${BOLD}${target.name ?? '(no name)'}${RESET} <${target.email}> — current role: ${BOLD}${target.role}${RESET}\n`
		);

		// Select target role
		console.log(`Available roles: ${ROLES.map((r, i) => `${i + 1}) ${r}`).join('  ')}`);
		const roleInput = (await ask(`${BOLD}New role [default: ADMIN]: ${RESET}`)).trim().toUpperCase();
		const newRole: Role = (ROLES.find((r) => r === roleInput) ?? 'ADMIN') as Role;

		if (newRole === target.role) {
			console.log(`\n${YELLOW}User already has role ${newRole}. Nothing to do.${RESET}\n`);
			return;
		}

		// Confirm
		const confirm = (
			await ask(
				`\nSet ${BOLD}${target.email}${RESET} from ${YELLOW}${target.role}${RESET} → ${GREEN}${newRole}${RESET}? [y/N] `
			)
		)
			.trim()
			.toLowerCase();

		if (confirm !== 'y') {
			console.log(`\n${DIM}Aborted.${RESET}\n`);
			return;
		}

		await client.query('UPDATE "User" SET role = $1 WHERE id = $2', [newRole, target.id]);
		console.log(`\n${GREEN}${BOLD}Done.${RESET} ${target.email} is now ${GREEN}${newRole}${RESET}.\n`);
	} finally {
		await client.end();
		rl.close();
	}
}

main().catch((err) => {
	console.error(`${RED}Fatal error:${RESET}`, err.message);
	process.exit(1);
});
