import { createRouter, createWebHistory } from 'vue-router'
import CubeDemoView from '../views/CubeDemoView.vue'

const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes: [
        {
            path: '/',
            name: 'cube-demo',
            component: CubeDemoView
        },
        {
            path: '/about',
            name: 'about',
            component: () => import('../views/AboutView.vue')
        }
    ]
})

export default router
