// Applies any migrations the hosted project has not recorded yet, through the
// Supabase Management API (no database password needed).
//
//   SUPABASE_ACCESS_TOKEN=sbp_... npm run db:push:hosted
//
// The access token comes from https://supabase.com/dashboard/account/tokens
// and can live in scripts/.env. Use `supabase db push` instead whenever the
// CLI's own connection works; this is the fallback.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF ?? 'cyqumbvoowvnxxaovsqn';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) {
  console.error('Set SUPABASE_ACCESS_TOKEN (personal access token) in scripts/.env');
  process.exit(1);
}

const dir = join(process.cwd(), 'supabase', 'migrations');

async function query(sql: string): Promise<unknown> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

async function run() {
  const applied = new Set(
    ((await query('select version from supabase_migrations.schema_migrations')) as { version: string }[]).map((r) => r.version),
  );
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  let count = 0;
  for (const file of files) {
    const version = file.split('_')[0];
    if (applied.has(version)) continue;
    const name = file.replace(/^\d+_/, '').replace(/\.sql$/, '');
    process.stdout.write(`Applying ${file} … `);
    const sql = readFileSync(join(dir, file), 'utf8');
    // One statement batch per migration so it is all-or-nothing on the server.
    await query(`begin;\n${sql}\ninsert into supabase_migrations.schema_migrations (version, name) values ('${version}', '${name}');\ncommit;`);
    console.log('ok');
    count += 1;
  }
  console.log(count ? `Applied ${count} migration(s).` : 'Hosted project is up to date.');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
