<template>
    <div ref="containerRef" class="stage"></div>
    <aside class="move-panel">
        <p class="move-title">立方体位置（米）</p>
        <div class="move-row">
            <label>X <input v-model.number="posX" type="number" step="0.1" /></label>
            <label>Y <input v-model.number="posY" type="number" step="0.1" /></label>
            <label>Z <input v-model.number="posZ" type="number" step="0.1" /></label>
        </div>
        <button type="button" class="move-btn" @click="moveCubeToInput">移动到该坐标</button>
    </aside>
</template>

<script setup lang="ts">
/**
 * Three.js 速览（对照下面代码看一遍即可）
 * 1. Scene：世界容器，里面放 Mesh / Light / Helper。
 * 2. Camera：从哪看、看什么范围（PerspectiveCamera 的 fov / aspect / near / far）。
 * 3. WebGLRenderer：把 scene 从 camera 视角画进 canvas。
 * 4. Mesh = Geometry（形状）+ Material（如何着色）；非 Basic 材质一般需要 Light。
 * 5. 每帧：更新物体（可选）→ controls.update()（若用轨道相机）→ renderer.render。
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

const containerRef = ref<HTMLDivElement | null>(null)

/** 与初始立方体位置一致：中心在格子上方半格 */
const posX = ref(0)
const posY = ref(0.5)
const posZ = ref(0)

function moveCubeToInput() {
    if (!demoCube) return
    const x = Number(posX.value)
    const y = Number(posY.value)
    const z = Number(posZ.value)
    if ([x, y, z].some((n) => Number.isNaN(n))) return
    demoCube.position.set(x, y, z)
}

let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let controls: OrbitControls | null = null
let onResize: (() => void) | null = null
let onCanvasClick: ((e: MouseEvent) => void) | null = null
let rafId = 0
/** 教学用立方体，动画里会旋转 */
let demoCube: THREE.Mesh | null = null

function tick() {
    if (!renderer || !scene || !camera) return
    if (demoCube) demoCube.rotation.y += 0.01
    controls?.update()
    renderer.render(scene, camera)
    rafId = requestAnimationFrame(tick)
}

onMounted(() => {
    // 场景：放物体、灯光的容器
    const el = containerRef.value
    if (!el) return
    const width = el.clientWidth
    const height = el.clientHeight
    // 场景
    scene = new THREE.Scene()
    scene.background = new THREE.Color('#222233')
    /**
     * 【单位协议】全链路统一为米 (m)：
     * - 后端下发的坐标、尺寸、速度等凡可映射到世界空间的量，约定为米；
     * - Three.js 场景内 position / scale（对世界几何而言）/ PerspectiveCamera.near|far 等均按米理解；
     * - 非米制资源仅在进入场景前换算（例：GLB 按厘米建模则根节点 scale ×0.01，或顶点/包围盒在加载时 ×0.01）。
     */
    const cameraPosM = new THREE.Vector3(8, 8, 8)
    const nearM = 0.1
    const farM = 500
    // 相机（near / far 与距离均为米，与协议一致）
    camera = new THREE.PerspectiveCamera(50, width / height, nearM, farM)
    // 1. `50` — 垂直视野角。数值越大，画面越「广」，物体显得越小
    // 2. `width / height` — 宽高比（`aspect`）。必须和画布一致，否则物体会被拉长或压扁。
    // 3. `nearM` — 近裁剪面 (m)。比这个更近的不渲染。
    // 4. `farM` — 远裁剪面 (m)。比这个更远的不渲染。
    // 相机若在 (0,0,z) 只沿 −Z 看原点，视线与 Z 轴重合，蓝轴会缩成一点，像只剩 X、Y。
    // 斜上方观察 + lookAt 原点，三根轴都会以线段形式出现在画面里。
    camera.position.copy(cameraPosM)
    camera.lookAt(0, 0, 0)
    // 渲染器：把场景画到 canvas 上
    renderer = new THREE.WebGLRenderer({ antialias: true })
    //- `antialias: true`：开启多重采样抗锯齿，边缘会柔和一些，性能略多花一点。关掉则边缘      「锯齿」、通常略快。还可以传的常见选项：`alpha`（透明背景）、`powerPreference`（GPU 功耗     偏好）等。
    renderer.setPixelRatio(window.devicePixelRatio)
    //- `devicePixelRatio`：物理像素 / CSS 像素的比（Retina 屏常为 2 或 3）。
    //- 不设或设为 1 时，在高 DPR 屏上 canvas 的「逻辑尺寸」对，但实际像素不够，画面会糊。
    //- 设成 `devicePixelRatio`（或 `Math.min(devicePixelRatio, 2)` 做上限以省性能）可     //以让画布按物理分辨率绘制，更清晰。
    renderer.setSize(width, height)
    //- 把 canvas 的绘图缓冲 设为 `width × height`（和你器 `clientWidth/clientHeight` 一     致）。
    //- 窗口缩放时你已在`resize` 里再次调用 `setSize`，避免尺寸脱节。
    el.appendChild(renderer.domElement)

    // —— 下面这段是「一眼能看懂场景」的教学标配 ——
    scene.add(new THREE.AxesHelper(4)) // 添加坐标轴辅助器
    const grid = new THREE.GridHelper(20, 20, 0x444466, 0x333344) // 添加网格辅助器
    scene.add(grid) // 添加到场景中

    const ambient = new THREE.AmbientLight(0xffffff, 0.35) // 添加环境光
    scene.add(ambient) // 添加到场景中
    const sun = new THREE.DirectionalLight(0xffffff, 1.2) // 添加方向光
    sun.position.set(5, 10, 7)
    scene.add(sun) // 添加到场景中

    const geo = new THREE.BoxGeometry(1, 1, 1) // 创建立方体几何体
    const mat = new THREE.MeshStandardMaterial({
        // 创建标准材质
        color: 0x66aaff,
        roughness: 0.4,
        metalness: 0.15
    }) // 设置材质颜色、粗糙度和金属度
    demoCube = new THREE.Mesh(geo, mat) // 创建立方体网格
    demoCube.position.y = 0.5 // 设置立方体位置
    scene.add(demoCube) // 添加到场景中

    controls = new OrbitControls(camera, renderer.domElement) // 创建轨道控制器
    controls.enableDamping = true // 启用阻尼
    controls.target.set(0, 0.5, 0) // 设置轨道控制器目标位置

    // 窗口或布局变化时：同步画布尺寸与相机宽高比，避免画面拉伸、比例错乱
    onResize = () => {
        // 组件已卸载或尚未就绪时不处理，避免空引用
        if (!renderer || !camera || !el) return
        const w = el.clientWidth
        const h = el.clientHeight
        // 透视相机宽高比须与画布一致，否则物体看起来会被压扁或拉高
        camera.aspect = w / h
        //更新相机的投影矩阵
        camera.updateProjectionMatrix()
        // 调整 WebGL 绘图缓冲大小，与容器 DOM 尺寸一致
        renderer.setSize(w, h)
    }
    // 浏览器窗口尺寸变化时触发；卸载时在 onBeforeUnmount 里 removeEventListener
    window.addEventListener('resize', onResize!)

    rafId = requestAnimationFrame(tick)
})

// 组件销毁前释放 Three / DOM / 事件，避免泄漏与重复监听
onBeforeUnmount(() => {
    cancelAnimationFrame(rafId)
    controls?.dispose()
    controls = null
    demoCube = null
    if (onResize) window.removeEventListener('resize', onResize)
    if (renderer && onCanvasClick) {
        renderer.domElement.removeEventListener('click', onCanvasClick)
    }
    onCanvasClick = null
    const el = containerRef.value
    // 从挂载容器移除 canvas，避免残留节点
    if (renderer && el && renderer.domElement.parentElement === el) {
        el.removeChild(renderer.domElement)
    }
    // 释放 WebGL 上下文相关资源（纹理缓冲等由后续 dispose 几何/材质配合清理）
    renderer?.dispose()
    // 遍历场景图，显式 dispose 网格的几何体与材质（GPU / 内存）
    scene?.traverse((obj: THREE.Object3D) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
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

.move-panel {
    position: fixed;
    left: 12px;
    top: 48px;
    z-index: 10;
    padding: 12px 14px;
    background: rgba(34, 34, 51, 0.92);
    border: 1px solid #444466;
    border-radius: 8px;
    color: #e8e8f0;
    font-size: 13px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.35);
}

.move-title {
    margin: 0 0 10px;
    font-weight: 600;
}

.move-row {
    display: flex;
    flex-wrap: wrap;
    gap: 10px 14px;
    margin-bottom: 10px;
}

.move-row label {
    display: flex;
    align-items: center;
    gap: 6px;
}

.move-row input {
    width: 72px;
    padding: 4px 8px;
    border: 1px solid #555577;
    border-radius: 4px;
    background: #1a1a28;
    color: inherit;
}

.move-btn {
    width: 100%;
    padding: 8px 12px;
    border: none;
    border-radius: 6px;
    background: #66aaff;
    color: #111;
    font-weight: 600;
    cursor: pointer;
}

.move-btn:hover {
    filter: brightness(1.08);
}
</style>
