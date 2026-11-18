<script setup>
import { useMessage } from 'naive-ui'
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useScopedI18n } from '@/i18n/app'
import { KeyFilled } from '@vicons/material'

import { api } from '../../api';
import { useGlobalState } from '../../store'
import { getRouterPathWithLang, hashPassword } from '../../utils';
import { startAuthentication } from '@simplewebauthn/browser';

import Turnstile from '../../components/Turnstile.vue';

const {
    userJwt, userSettings, userOpenSettings, openSettings, adminAuth, showAdminAuth, loading,
    userOauth2SessionState, userOauth2SessionClientID, resetLoginSessions,
} = useGlobalState()
const message = useMessage();
const route = useRoute()
const router = useRouter()

const { t, locale } = useScopedI18n('views.user.UserLogin')
const tabValue = ref("signin");
const identifier = ref(route.query.role === 'admin' || openSettings.value.disableUserSystem ? 'admin' : '')
const signInPassword = ref('')
const accountOptionsAvailable = computed(() => !openSettings.value.disableUserSystem && identifier.value.trim() !== 'admin')
const canRecoverPassword = computed(() => userOpenSettings.value.enable && userOpenSettings.value.enableMailVerify)
const showModal = ref(false);
const user = ref({
    email: "",
    password: "",
    code: ""
});
const signupCfToken = ref("")
const resetCfToken = ref("")
const loginCfToken = ref("")
const signupTurnstileRef = ref(null)
const resetTurnstileRef = ref(null)
const loginTurnstileRef = ref(null)

const finishUserSignIn = async (jwt) => {
    resetLoginSessions()
    userJwt.value = jwt
    await api.getUserSettings(message)
    if (userSettings.value.user_email) await router.replace(getRouterPathWithLang('/user', locale.value))
}

const signIn = async () => {
    const name = identifier.value.trim()
    const password = signInPassword.value
    if (!name || !password) {
        message.error(t('signInRequired'))
        return
    }
    try {
        const isAdmin = name === 'admin'
        const res = await api.fetch(isAdmin ? '/open_api/admin_login' : '/user_api/login', {
            method: 'POST',
            body: {
                ...(isAdmin ? { username: name } : { email: name }),
                password: await hashPassword(password),
                cf_token: loginCfToken.value,
            },
        })
        signInPassword.value = ''
        if (isAdmin) {
            resetLoginSessions()
            adminAuth.value = password
            showAdminAuth.value = false
            await router.replace(getRouterPathWithLang('/admin', locale.value))
        } else {
            await finishUserSignIn(res.jwt)
        }
    } catch (error) {
        message.error(error.message || "login failed");
        loginTurnstileRef.value?.refresh?.();
    }
};

const verifyCodeExpire = ref(0);
const verifyCodeTimeout = ref(0);

const getVerifyCodeTimeout = () => {
    if (!verifyCodeExpire.value || verifyCodeExpire.value < new Date().getTime()) return 0;
    return Math.round((verifyCodeExpire.value - new Date().getTime()) / 1000);
};

const sendVerificationCode = async () => {
    if (!user.value.email) {
        message.error(t('pleaseInputEmail'));
        return;
    }
    const currentCfToken = showModal.value ? resetCfToken.value : signupCfToken.value;
    if (openSettings.value.cfTurnstileSiteKey && !currentCfToken && userOpenSettings.value.enableMailVerify) {
        message.error(t('pleaseCompleteTurnstile'));
        return;
    }
    try {
        const res = await api.fetch(`/user_api/verify_code`, {
            method: "POST",
            body: JSON.stringify({
                email: user.value.email,
                cf_token: currentCfToken
            })
        });
        if (res && res.expirationTtl) {
            message.success(t('verifyCodeSent', { timeout: res.expirationTtl }));
            verifyCodeExpire.value = new Date().getTime() + res.expirationTtl * 1000;
            const intervalId = setInterval(() => {
                verifyCodeTimeout.value = getVerifyCodeTimeout();
                if (verifyCodeTimeout.value <= 0) {
                    clearInterval(intervalId);
                    verifyCodeTimeout.value = 0;
                }
            }, 1000);
        }
    } catch (error) {
        message.error(error.message || "send verification code failed");
    }
    if (showModal.value) {
        resetTurnstileRef.value?.refresh?.();
    } else {
        signupTurnstileRef.value?.refresh?.();
    }
};

const emailSignup = async () => {
    if (!user.value.email || !user.value.password) {
        message.error(t('pleaseInput'));
        return;
    }
    if (!user.value.code && userOpenSettings.value.enableMailVerify) {
        message.error(t('pleaseInputCode'));
        return;
    }
    try {
        const res = await api.fetch(`/user_api/register`, {
            method: "POST",
            body: JSON.stringify({
                email: user.value.email,
                // hash password
                password: await hashPassword(user.value.password),
                code: user.value.code,
                cf_token: showModal.value ? resetCfToken.value : signupCfToken.value
            }),
            message: message
        });
        if (res) {
            tabValue.value = "signin";
            identifier.value = user.value.email.trim()
            user.value.password = ''
            message.success(t('pleaseLogin'));
        }
        showModal.value = false;
    } catch (error) {
        message.error(error.message || "register failed");
    }
};

const passkeyLogin = async () => {
    try {
        const options = await api.fetch(`/user_api/passkey/authenticate_request`, {
            method: 'POST',
            body: JSON.stringify({
                domain: location.hostname,
            })
        })
        const credential = await startAuthentication({ optionsJSON: options })

        // Send the result to the server and return the promise.
        const res = await api.fetch(`/user_api/passkey/authenticate_response`, {
            method: 'POST',
            body: JSON.stringify({
                origin: location.origin,
                domain: location.hostname,
                credential
            })
        })
        await finishUserSignIn(res.jwt)
    } catch (e) {
        console.error(e)
        message.error(e.message)
    }
};

const oauth2Login = async (clientID) => {
    try {
        userOauth2SessionClientID.value = clientID;
        userOauth2SessionState.value = Math.random().toString(36).substring(2);
        const res = await api.fetch(`/user_api/oauth2/login_url?clientID=${clientID}&state=${userOauth2SessionState.value}`);
        // redirect to oauth2 login page
        location.href = res.url;
    } catch (error) {
        message.error(error.message || "login failed");
    }
};

</script>

<template>
    <div class="sign-in">
        <n-tabs v-model:value="tabValue" size="large">
            <n-tab-pane name="signin" :tab="t('login')">
                <n-form size="large" @submit.prevent="signIn">
                    <n-form-item-row :label="t('identifier')" required>
                        <n-input v-model:value="identifier"
                            :input-props="{ 'aria-label': t('identifier'), autocomplete: 'username', autocapitalize: 'none', spellcheck: false }" />
                    </n-form-item-row>
                    <n-form-item-row :label="t('password')" required>
                        <n-input v-model:value="signInPassword" type="password" show-password-on="click"
                            :input-props="{ 'aria-label': t('password'), autocomplete: 'current-password' }" />
                    </n-form-item-row>
                    <Turnstile ref="loginTurnstileRef" v-if="openSettings.enableGlobalTurnstileCheck" v-model:value="loginCfToken" />
                    <n-button attr-type="submit" type="primary" size="large" block strong :loading="loading">
                        {{ t('login') }}
                    </n-button>
                    <div v-if="accountOptionsAvailable" class="account-login-links">
                        <n-button v-if="canRecoverPassword" text @click="showModal = true">
                            {{ t('forgotPassword') }}
                        </n-button>
                        <n-button text @click="passkeyLogin">
                            <template #icon>
                                <n-icon :component="KeyFilled" />
                            </template>
                            {{ t('loginWithPasskey') }}
                        </n-button>
                        <n-button v-for="item in userOpenSettings.oauth2ClientIDs"
                            :key="item.clientID" text @click="oauth2Login(item.clientID)">
                            <template #icon v-if="item.icon">
                                <span class="oauth2-icon" v-html="item.icon"></span>
                            </template>
                            {{ t('loginWith', { provider: item.name }) }}
                        </n-button>
                    </div>
                </n-form>
            </n-tab-pane>
            <n-tab-pane v-if="!openSettings.disableUserSystem && userOpenSettings.enable" name="signup" :tab="t('register')">
                <n-form size="large" @submit.prevent="emailSignup">
                    <n-form-item-row :label="t('email')" required>
                        <n-input v-model:value="user.email" :input-props="{ 'aria-label': t('email'), autocomplete: 'username', type: 'email' }" />
                    </n-form-item-row>
                    <n-form-item-row :label="t('password')" required>
                        <n-input v-model:value="user.password" type="password" show-password-on="click"
                            :input-props="{ 'aria-label': t('password'), autocomplete: 'new-password' }" />
                    </n-form-item-row>
                    <Turnstile ref="signupTurnstileRef" v-if="userOpenSettings.enableMailVerify" v-model:value="signupCfToken" />
                    <n-form-item-row v-if="userOpenSettings.enableMailVerify" :label="t('verifyCode')" required>
                        <n-input-group>
                            <n-input v-model:value="user.code" />
                            <n-button @click="sendVerificationCode" style="margin-bottom: 0" type="primary" ghost
                                :disabled="verifyCodeTimeout > 0">
                                {{ verifyCodeTimeout > 0 ? t('waitforVerifyCode', { timeout: verifyCodeTimeout })
                                    : t('sendVerificationCode') }}
                            </n-button>
                        </n-input-group>
                    </n-form-item-row>
                    <Turnstile ref="signupTurnstileRef" v-if="!userOpenSettings.enableMailVerify" v-model:value="signupCfToken" />
                    <n-button attr-type="submit" type="primary" size="large" block strong :loading="loading">
                        {{ t('register') }}
                    </n-button>
                </n-form>
            </n-tab-pane>
        </n-tabs>
        <n-modal v-if="canRecoverPassword" v-model:show="showModal" style="max-width: 600px;" preset="card" :title="t('forgotPassword')">
            <n-form @submit.prevent="emailSignup">
                <n-form-item-row :label="t('email')" required>
                    <n-input v-model:value="user.email" :input-props="{ 'aria-label': t('email'), autocomplete: 'username', type: 'email' }" />
                </n-form-item-row>
                <n-form-item-row :label="t('password')" required>
                    <n-input v-model:value="user.password" type="password" show-password-on="click"
                        :input-props="{ 'aria-label': t('password'), autocomplete: 'new-password' }" />
                </n-form-item-row>
                <Turnstile ref="resetTurnstileRef" v-model:value="resetCfToken" />
                <n-form-item-row :label="t('verifyCode')" required>
                    <n-input-group>
                        <n-input v-model:value="user.code" />
                        <n-button @click="sendVerificationCode" style="margin-bottom: 0" type="primary" ghost
                            :disabled="verifyCodeTimeout > 0">
                            {{ verifyCodeTimeout > 0 ? t('waitforVerifyCode', { timeout: verifyCodeTimeout })
                                : t('sendVerificationCode') }}
                        </n-button>
                    </n-input-group>
                </n-form-item-row>
                <n-button attr-type="submit" type="primary" block strong :loading="loading">
                    {{ t('resetPassword') }}
                </n-button>
            </n-form>
        </n-modal>
    </div>
</template>

<style scoped>
.sign-in {
    width: 100%;
    min-width: 0;
}

.account-login-links {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px 16px;
    margin-top: 16px;
}

.oauth2-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
}

.oauth2-icon :deep(svg) {
    width: 100%;
    height: 100%;
}
</style>
