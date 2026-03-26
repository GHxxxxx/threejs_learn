<template>
    <div ref="containerRef" class="stage"></div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import * as THREE from 'three'

const containerRef = ref<HTMLDivElement | null>(null)

let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let onResize: (() => void) | null = null

onMounted(() => {
    // 场景：放物体、灯光的容器
    const el = containerRef.value
    if (!el) return

    const width = el.clientWidth
    const height = el.clientHeight

    // 场景
    scene = new THREE.Scene()
    scene.background = new THREE.Color('#222233')

    // 相机
    camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100)
    // 1. `50` — 垂直视野角。数值越大，画面越「广」，物体显得越小
    // 2. `width / height` — 宽高比（`aspect`）。必须和画布一致，否则物体会被拉长或压扁。
    // 3. `0.1` — 近裁剪面（`near`）。比这个更近的东西不画（避免数值问题）。
    // 4. `100` — 远裁剪面（`far`）。比这个更远的不画。透视相机的效果就是常说的「近大远小」
    camera.position.z = 4
    //Three 里默认 相机朝向 −Z（看向场景中心 `(0,0,0)`）。  
    //立方体默认在原点，所以把相机放在 `z = 4`（眼睛在 z 正方向、朝原点看），才能看到中间的物     //体。  若 `z` 太小可能贴着模型，`z` 太大物体会变小。
    //通常还会配合 `camera.lookAt(0, 0, 0)` 明确看向原点；默认朝向很多教程场景里已经够用。

    // 渲染器：把场景画到 canvas 上

    renderer = new THREE.WebGLRenderer({ antialias: true })
    //- `antialias: true`：开启多重采样抗锯齿，边缘会柔和一些，性能略多花一点。关掉则边缘      「锯齿」、通常略快。还可以传的常见选项：`alpha`（透明背景）、`powerPreference`（GPU 功耗     偏好）等。
    renderer.setPixelRatio(window.devicePixelRatio)
    //- `devicePixelRatio`：物理像素 / CSS 像素的比（Retina 屏常为 2 或 3）。
    //- 不设或设为 1 时，在高 DPR 屏上 canvas 的「逻辑尺寸」对，但实际像素不够，画面会糊。
    //- 设成 `devicePixelRatio`（或 `Math.min(devicePixelRatio, 2)` 做上限以省性能）可     //以让画布按物理分辨率绘制，更清晰。
    renderer.setSize(width, height)
    //- 把 canvas 的绘图缓冲 设为 `width × height`（和你器 `clientWidth/clientHeight` 一     致）。
    //- 窗口缩放时你已在`resize` 里再次调用 `setSize`，避免尺寸脱节。
    el.appendChild(renderer.domElement)


    // 窗口或布局变化时：同步画布尺寸与相机宽高比，避免画面拉伸、比例错乱
    onResize = () => {
        // 组件已卸载或尚未就绪时不处理，避免空引用
        if (!renderer || !camera || !el) return
        const w = el.clientWidth
        const h = el.clientHeight
        // 透视相机宽高比须与画布一致，否则物体看起来会被压扁或拉高
        camera.aspect = w / h
        camera.updateProjectionMatrix()
        // 调整 WebGL 绘图缓冲大小，与容器 DOM 尺寸一致
        renderer.setSize(w, h)
    }
    // 浏览器窗口尺寸变化时触发；卸载时在 onBeforeUnmount 里 removeEventListener
    window.addEventListener('resize', onResize!)

    // 将当前 scene 从 camera 视角绘制到 canvas（静态场景画一次即可；有动画需配合 rAF 每帧 render）
    renderer.render(scene, camera)
})

// 组件销毁前释放 Three / DOM / 事件，避免泄漏与重复监听
onBeforeUnmount(() => {
    if (onResize) window.removeEventListener('resize', onResize)
    const el = containerRef.value
    // 从挂载容器移除 canvas，避免残留节点
    if (renderer && el && renderer.domElement.parentElement === el) {
        el.removeChild(renderer.domElement)
    }
    // 释放 WebGL 上下文相关资源（纹理缓冲等由后续 dispose 几何/材质配合清理）
    renderer?.dispose()
    // 遍历场景图，显式 dispose 网格的几何体与材质（GPU / 内存）
    scene?.traverse((obj: THREE.Object3D) => {
        if (obj instanceof THREE.Mesh) {
            obj.geometry.dispose()
            const mat = obj.material
            if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
            else mat.dispose()
        }
    })
    renderer = null
    scene = null
    camera = null
    onResize = null
})
</script>

<style scoped>
.stage {
    width: 100vw;
    height: 100vh;
    margin: 0;
    overflow: hidden;
}
</style>
