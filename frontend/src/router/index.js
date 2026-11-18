import { createRouter, createWebHistory } from 'vue-router'
import Index from '../views/Index.vue'
import UserOauth2Callback from '../views/user/UserOauth2Callback.vue'
import i18n from '../i18n'
import { useGlobalState } from '../store'
import { adminPathAliases, adminPaths, mailboxPaths, userPaths } from './workspace-paths'
import {
    DEFAULT_LOCALE,
    getBrowserLocales,
    getPreferredLocale,
    replaceLocaleInFullPath,
    resolveSupportedLocale,
} from '../i18n/utils'

const { jwt, preferredLocale } = useGlobalState()
const loadUser = () => import('../views/User.vue')
const loadAdmin = () => import('../views/Admin.vue')

const workspaceRoute = (workspace, section, path, component, view, aliases = []) => ({
    path,
    alias: [`/:lang${path}`, ...aliases.flatMap(alias => [alias, `/:lang${alias}`])],
    component,
    meta: { workspace, section, view },
})

const router = createRouter({
    history: createWebHistory(),
    routes: [
        ...Object.entries(mailboxPaths).map(([section, path]) => workspaceRoute('mailbox', section, path, Index)),
        {
            name: 'login',
            path: '/login',
            alias: '/:lang/login',
            component: () => import('../views/Login.vue')
        },
        ...Object.entries(userPaths).map(([section, path]) => workspaceRoute('user', section, path, loadUser)),
        {
            name: 'redeem',
            path: '/redeem',
            alias: '/:lang/redeem',
            component: () => import('../views/Redeem.vue')
        },
        {
            name: 'user-oauth-callback',
            path: '/user/oauth2/callback',
            alias: '/:lang/user/oauth2/callback',
            component: UserOauth2Callback
        },
        ...Object.entries(adminPaths).flatMap(([section, views]) => Object.entries(views)
            .map(([view, path]) => workspaceRoute('admin', section, path, loadAdmin, view, adminPathAliases[view]))),
        {
            path: '/admin',
            alias: '/:lang/admin',
            component: loadAdmin,
            meta: { workspace: 'admin', section: 'account', view: 'account' },
        },
        {
            name: 'telegram-mail',
            path: '/telegram_mail',
            alias: '/:lang/telegram_mail',
            component: () => import('../views/telegram/Mail.vue')
        },
        {
            name: 'not-found',
            path: '/:pathMatch(.*)*',
            redirect: '/'
        }
    ]
});

router.beforeEach((to, from, next) => {
    const routeLocale = resolveSupportedLocale(to.path.split('/')[1])
    const resolvedLocale = routeLocale || DEFAULT_LOCALE
    i18n.global.locale.value = resolvedLocale

    if (routeLocale) {
        preferredLocale.value = routeLocale
    } else if (!preferredLocale.value) {
        preferredLocale.value = getPreferredLocale('', getBrowserLocales())
    }

    if (Object.prototype.hasOwnProperty.call(to.query, 'jwt')) {
        const jwtQuery = Array.isArray(to.query.jwt) ? to.query.jwt[0] : to.query.jwt
        if (typeof jwtQuery === 'string') {
            jwt.value = jwtQuery
        }
        const query = { ...to.query }
        delete query.jwt
        next({
            path: to.path,
            query,
            hash: to.hash,
            replace: true,
        })
        return
    }

    if (routeLocale) {
        const canonicalRoutePath = replaceLocaleInFullPath(to.fullPath, routeLocale)
        if (canonicalRoutePath !== to.fullPath) {
            return next(canonicalRoutePath)
        }
    }

    if (routeLocale === DEFAULT_LOCALE) {
        return next(replaceLocaleInFullPath(to.fullPath, DEFAULT_LOCALE))
    }

    next()
});

export default router
