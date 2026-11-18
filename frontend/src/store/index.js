import { computed, ref } from "vue";
import {
    createGlobalState, useStorage, useDark, useToggle,
    useLocalStorage, useSessionStorage
} from '@vueuse/core'

export const useGlobalState = createGlobalState(
    () => {
        const isDark = useDark()
        const toggleDark = useToggle(isDark)
        const loading = ref(false);
        const announcement = useLocalStorage('announcement', '');
        const useSimpleIndex = useLocalStorage('useSimpleIndex', false);
        const openSettings = ref({
            fetched: false,
            title: '',
            announcement: '',
            alwaysShowAnnouncement: false,
            prefix: '',
            addressRegex: '',
            needAuth: false,
            adminContact: '',
            disableUserSystem: false,
            enableUserCreateEmail: false,
            receiveOnlyUsers: false,
            telegramConfigured: false,
            disableAnonymousUserCreateEmail: false,
            disableCustomAddressName: false,
            enableUserDeleteEmail: false,
            enableMailReadStatus: false,
            enableAutoReply: false,
            enableIndexAbout: false,
            /** @type {string[]} */
            defaultDomains: [],
            /** @type {string[]} */
            randomSubdomainDomains: [],
            /** @type {Array<{label: string, value: string}>} */
            domains: [],
            copyright: 'Dream Hunter',
            cfTurnstileSiteKey: '',
            enableWebhook: false,
            isS3Enabled: false,
            enableSendMail: false,
            translation: null,
            showGithub: true,
            showGithubForUser: true,
            disableAdminPasswordCheck: false,
            enableAddressPassword: false,
            addressPasswordLoginOnly: false,
            enableAgentEmailInfo: false,
            enableRedeemCode: false,
            redeemCodeUrl: '',
            smtpImapProxyConfig: {
                smtp: {
                    host: '',
                    port: 8025,
                    starttls: false,
                },
                imap: {
                    host: '',
                    port: 11143,
                    starttls: false,
                },
            },
            statusUrl: '',
            enableGlobalTurnstileCheck: false,
        })
        const settings = ref({
            fetched: false,
            send_balance: 0,
            send_unlimited: false,
            address: '',
            auto_reply: {
                subject: '',
                message: '',
                enabled: false,
                source_prefix: '',
                name: '',
            }
        });
        const sendMailModel = useSessionStorage('sendMailModel', {
            fromName: "",
            toName: "",
            toMail: "",
            subject: "",
            contentType: 'text',
            content: "",
        });
        const showAuth = ref(false);
        const showAddressCredential = ref(false);
        const showAdminAuth = ref(false);
        const auth = useStorage('auth', '');
        const adminAuth = useStorage('adminAuth', '');
        const jwt = useStorage('jwt', '');
        const addressPassword = useSessionStorage('addressPassword', '');
        const mailboxSplitSize = useStorage('mailboxSplitSize', 0.25);
        const mailListView = useStorage('mailListView', false);
        const mailListPreviewLineClamp = useStorage('mailListPreviewLineClamp', 1);
        const useIframeShowMail = useStorage('useIframeShowMail', false);
        const preferShowTextMail = useStorage('preferShowTextMail', false);
        const userJwt = useStorage('userJwt', '');
        const preferredLocale = useStorage('preferredLocale', '');
        const useSideMargin = useStorage('useSideMargin', true);
        const useUTCDate = useStorage('useUTCDate', false);
        const autoLoadRemoteImages = useStorage('autoLoadRemoteImages', true);
        const mailTranslationLanguage = useStorage('mailTranslationLanguage', '');
        const draftTranslationLanguage = useStorage('draftTranslationLanguage', '');
        const autoRefresh = useStorage('autoRefresh', false);
        const configAutoRefreshInterval = useStorage("configAutoRefreshInterval", 60);
        const userOpenSettings = ref({
            fetched: false,
            enable: false,
            enableMailVerify: false,
            /** @type {{ clientID: string, name: string, icon?: string }[]} */
            oauth2ClientIDs: [],
        });
        const defaultUserSettings = {
            /** @type {boolean} */
            fetched: false,
            /** @type {string} */
            user_email: '',
            /** @type {number} */
            user_id: 0,
            /** @type {boolean} */
            is_admin: false,
            /** @type {string | null} */
            access_token: null,
            /** @type {string | null} */
            new_user_token: null,
            /** @type {null | {domains: string[] | undefined | null, role: string, prefix: string | undefined | null}} */
            user_role: null,
            translation: null,
        };
        const userSettings = ref({ ...defaultUserSettings });
        const resetLoginSessions = () => {
            if (!openSettings.value.receiveOnlyUsers) return;
            adminAuth.value = '';
            showAdminAuth.value = false;
            userJwt.value = '';
            userSettings.value = { ...defaultUserSettings };
            jwt.value = '';
            settings.value = { ...settings.value, address: '' };
            addressPassword.value = '';
            showAddressCredential.value = false;
        };
        const isReceiveOnlyAccount = computed(() => openSettings.value.receiveOnlyUsers
            && !!userSettings.value.user_email && !userSettings.value.is_admin
        );
        const showUserSystem = computed(() =>
            openSettings.value.fetched && !openSettings.value.disableUserSystem
        );
        const showUserMailboxes = computed(() =>
            showUserSystem.value && !!userJwt.value
        );
        const showAdminPage = computed(() =>
            !!adminAuth.value
            || userSettings.value.is_admin
            || openSettings.value.disableAdminPasswordCheck
        );
        const telegramApp = ref(window.Telegram?.WebApp || {});
        const isTelegram = ref(!!window.Telegram?.WebApp?.initData);
        const _oauth2StateSession = useSessionStorage('userOauth2SessionState', '');
        const _oauth2StateFallback = useStorage('userOauth2SessionState_fb', '');
        const userOauth2SessionState = computed({
            get: () => _oauth2StateSession.value || _oauth2StateFallback.value,
            set: (v) => { _oauth2StateSession.value = v; _oauth2StateFallback.value = v; }
        });
        const _oauth2ClientIDSession = useSessionStorage('userOauth2SessionClientID', '');
        const _oauth2ClientIDFallback = useStorage('userOauth2SessionClientID_fb', '');
        const userOauth2SessionClientID = computed({
            get: () => _oauth2ClientIDSession.value || _oauth2ClientIDFallback.value,
            set: (v) => { _oauth2ClientIDSession.value = v; _oauth2ClientIDFallback.value = v; }
        });
        const browserFingerprint = ref('');
        return {
            isDark,
            toggleDark,
            loading,
            settings,
            sendMailModel,
            announcement,
            openSettings,
            showAuth,
            showAddressCredential,
            auth,
            jwt,
            adminAuth,
            showAdminAuth,
            mailboxSplitSize,
            mailListView,
            mailListPreviewLineClamp,
            useIframeShowMail,
            preferShowTextMail,
            userJwt,
            preferredLocale,
            userOpenSettings,
            userSettings,
            isReceiveOnlyAccount,
            resetLoginSessions,
            useSideMargin,
            useUTCDate,
            autoLoadRemoteImages,
            mailTranslationLanguage,
            draftTranslationLanguage,
            autoRefresh,
            configAutoRefreshInterval,
            telegramApp,
            isTelegram,
            showAdminPage,
            showUserSystem,
            showUserMailboxes,
            userOauth2SessionState,
            userOauth2SessionClientID,
            useSimpleIndex,
            addressPassword,
            browserFingerprint,
        }
    },
)
