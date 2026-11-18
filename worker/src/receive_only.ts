const accountActions = new Set([
    'GET /user_api/open_settings', 'GET /user_api/settings',
    'POST /user_api/login', 'POST /user_api/register', 'POST /user_api/verify_code',
    'GET /user_api/oauth2/login_url', 'POST /user_api/oauth2/callback',
    'GET /user_api/passkey', 'POST /user_api/passkey/rename',
    'POST /user_api/passkey/register_request', 'POST /user_api/passkey/register_response',
    'POST /user_api/passkey/authenticate_request', 'POST /user_api/passkey/authenticate_response',
    'GET /user_api/provider_credentials', 'PUT /user_api/provider_credentials/deepseek',
    'DELETE /user_api/provider_credentials/deepseek', 'POST /user_api/translate',
    'GET /user_api/bind_address', 'POST /user_api/bind_address', 'GET /user_api/mails',
]);

const mailboxActions = new Set([
    'GET /api/settings', 'GET /api/mails', 'GET /api/parsed_mails', 'GET /api/attachment/list',
    'POST /api/address_login', 'POST /api/address_change_password', 'POST /api/new_address',
    'POST /api/attachment/get_url',
]);

export function canUseReceiveOnlyEndpoint(method: string, path: string) {
    const action = `${method} ${path}`;
    if (path.startsWith('/user_api/')) {
        return accountActions.has(action)
            || /^GET \/user_api\/bind_address_jwt\/\d+$/.test(action)
            || /^PATCH \/user_api\/mails\/\d+\/read$/.test(action)
            || /^DELETE \/user_api\/passkey\/\d+$/.test(action);
    }
    if (path.startsWith('/api/')) {
        return mailboxActions.has(action)
            || /^GET \/api\/(mail|parsed_mail)\/\d+$/.test(action)
            || /^PATCH \/api\/mails\/\d+\/read$/.test(action);
    }
    return !path.startsWith('/external/') && !path.startsWith('/redeem_api/');
}
