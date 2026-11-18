import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { getMailSearchHeaders } from '../src/email/search-headers.ts';

const [database, ...options] = process.argv.slice(2);
if (!database) throw new Error('Usage: node scripts/backfill-mail-search.mjs <database> [Wrangler options]');

const workerDir = fileURLToPath(new URL('..', import.meta.url));
const pending = 'search_sender IS NULL OR search_subject IS NULL';
const windowSize = 8;

function execute(...query) {
    const args = ['node_modules/wrangler/bin/wrangler.js', 'd1', 'execute', database, ...options, '--json', ...query];
    const output = execFileSync(process.execPath, args, { cwd: workerDir, encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
    if (query[0] === '--file') return;
    const results = JSON.parse(output);
    if (!results.length || results.some(result => !result.success)) throw new Error('D1 backfill query failed');
    return results;
}

function getRawText(row) {
    if (row.compressed) {
        try {
            return gunzipSync(Buffer.from(row.compressed, 'hex')).toString('utf8');
        } catch {
            console.warn(`Could not decompress message ${row.id}; using its plaintext copy.`);
        }
    }
    return Buffer.from(row.plaintext, 'hex').toString('utf8');
}

const sqlText = value => `CAST(X'${Buffer.from(value).toString('hex')}' AS TEXT)`;
const temp = mkdtempSync(join(tmpdir(), 'mail-search-'));
const sqlFile = join(temp, 'update.sql');
writeFileSync(sqlFile, '');

try {
    let total = 0;
    while (true) {
        const [{ results }] = execute('--command', `SELECT id, source,
            hex(CAST(raw AS BLOB)) AS plaintext, hex(raw_blob) AS compressed
            FROM raw_mails WHERE ${pending} ORDER BY id LIMIT ${windowSize}`);
        if (!results.length) break;

        const updates = results.map(row => {
            const { sender, subject } = getMailSearchHeaders(row.source ?? '', getRawText(row));
            return `UPDATE raw_mails SET search_sender = ${sqlText(sender)}, search_subject = ${sqlText(subject)}`
                + ` WHERE id = ${row.id} AND (${pending});`;
        });
        writeFileSync(sqlFile, updates.join('\n'));
        execute('--file', sqlFile);
        total += results.length;
        console.log(`Processed ${total} messages`);
    }
    console.log(`Search headers ready. ${total} messages processed.`);
} finally {
    unlinkSync(sqlFile);
    rmdirSync(temp);
}
