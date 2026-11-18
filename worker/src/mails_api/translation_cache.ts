import type { Context } from 'hono';
import { userCredentialScope } from '../provider_credentials';

export const maxTranslationParts = 30;
// Bump when the translation model or prompt changes.
const cacheVersion = 'deepseek-flash:v1';
const encoder = new TextEncoder();

export type TranslationResult = { text: string } | { segments: string[] };

export async function openTranslationCache(
    c: Context<HonoCustomType>, mailId: number, targetLanguage: string, part: number, input: object,
    user: UserPayload | null, fallbackToCachedLanguage: boolean,
) {
    const mailbox = c.get('jwtPayload');
    const admin = c.get('adminSenderOwner');
    const scope = user ? userCredentialScope(user)
        : admin ? `admin:${admin}` : `mailbox:${mailbox.address_id}`;
    const ownership = user
        ? ` AND EXISTS (SELECT 1 FROM users_address ua JOIN address a ON a.id = ua.address_id
            WHERE ua.user_id = ? AND a.name = rm.address)`
        : admin ? '' : ' AND rm.address = ?';
    const ownerParams = user ? [user.user_id] : admin ? [] : [mailbox.address];
    const hash = await crypto.subtle.digest('SHA-256', encoder.encode(JSON.stringify([cacheVersion, input])));
    const digest = btoa(String.fromCharCode(...new Uint8Array(hash)));
    const db = c.env.DB;
    const mail = await db.prepare(`
        SELECT rm.address, rm.source, rm.message_id, rm.created_at, mt.result, mt.target_language
        FROM raw_mails rm LEFT JOIN mail_translations mt ON mt.mail_id = rm.id
            AND mt.scope = ? AND mt.part = ? AND mt.digest = ?
            ${fallbackToCachedLanguage ? '' : 'AND mt.target_language = ?'}
        WHERE rm.id = ?${ownership}
        ${fallbackToCachedLanguage ? 'ORDER BY (mt.target_language = ?) DESC, mt.rowid DESC' : ''}
        LIMIT 1
    `).bind(scope, part, digest, ...(fallbackToCachedLanguage ? [] : [targetLanguage]),
        mailId, ...ownerParams, ...(fallbackToCachedLanguage ? [targetLanguage] : []))
        .first<{
            address: string | null; source: string | null; message_id: string | null;
            created_at: string | null; result: string | null; target_language: string | null;
        }>();
    if (!mail) return null;

    return {
        result: mail.result ? JSON.parse(mail.result) as TranslationResult : null,
        targetLanguage: mail.target_language,
        // If the message was deleted while translating, do not recreate a cache entry.
        save: (result: TranslationResult) => db.prepare(`
            INSERT INTO mail_translations (mail_id, scope, target_language, part, digest, result)
            SELECT rm.id, ?, ?, ?, ?, ? FROM raw_mails rm
            WHERE rm.id = ? AND rm.address IS ? AND rm.source IS ? AND rm.message_id IS ?
                AND rm.created_at IS ?${ownership}
            ON CONFLICT (mail_id, scope, target_language, part) DO UPDATE SET
                digest = excluded.digest, result = excluded.result
            WHERE mail_translations.digest <> excluded.digest
        `).bind(scope, targetLanguage, part, digest, JSON.stringify(result),
            mailId, mail.address, mail.source, mail.message_id, mail.created_at, ...ownerParams).run(),
    };
}
