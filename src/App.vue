<template>
    <header class="app-nav">
        <nav class="nav-inner">
            <RouterLink class="nav-link" to="/" exact-active-class="nav-link--active">立方体演示</RouterLink>
            <RouterLink class="nav-link" to="/about" active-class="nav-link--active">坐标转换</RouterLink>
        </nav>
    </header>
    <RouterView />
</template>

<script setup lang="ts"></script>

<style scoped>
.app-nav {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 20;
    height: 40px;
    display: flex;
    align-items: center;
    padding: 0 12px;
    background: rgba(26, 26, 40, 0.95);
    border-bottom: 1px solid #444466;
    box-sizing: border-box;
}

.nav-inner {
    display: flex;
    gap: 16px;
}

.nav-link {
    color: #b8b8d0;
    text-decoration: none;
    font-size: 14px;
    font-weight: 500;
}

.nav-link:hover {
    color: #e8e8f0;
}

.nav-link--active {
    color: #66aaff;
}
</style>
