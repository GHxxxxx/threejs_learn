<template>
    <div class="page">
        <div ref="containerRef" class="stage"></div>
        <aside class="panel">
            <h1 class="panel-title">屏幕坐标 ↔ 世界坐标</h1>
            <p class="hint">
                在左侧画布上移动鼠标：用 Raycaster 将<strong>画布像素坐标</strong>转为与
                <code>y = 0</code> 地面的交点（世界坐标）。橙色小球为固定参考点，演示
                <code>world.project(camera)</code> 到画布像素。
            </p>
            <RouterLink class="back" to="/">返回立方体演示</RouterLink>

            <section class="block">
                <h2>鼠标 → 世界（地面 y = 0）</h2>
                <dl class="kv">
                    <dt>画布像素 (相对 canvas 左上)</dt>
                    <dd>{{ fmt2(pointerCanvas.x) }}, {{ fmt2(pointerCanvas.y) }}</dd>
                    <dt>世界坐标 (交点)</dt>
                    <dd>{{ fmt3(worldOnPlane.x) }}, {{ fmt3(worldOnPlane.y) }}, {{ fmt3(worldOnPlane.z) }}</dd>
                    <dt>再投影回画布（校验）</dt>
                    <dd>
                        {{ fmt2(roundTripCanvas.x) }}, {{ fmt2(roundTripCanvas.y) }}
                        <span v-if="roundTripOk" class="ok">（与鼠标一致）</span>
                        <span v-else class="warn">（偏离 {{ fmt2(roundTripErr) }} px）</span>
                    </dd>
                </dl>
            </section>

            <section class="block">
                <h2>参考点 → 屏幕</h2>
                <p class="sub">
                    世界 {{ fmt3(refWorld.x) }}, {{ fmt3(refWorld.y) }}, {{ fmt3(refWorld.z) }}
                </p>
                <dl class="kv">
                    <dt>画布像素</dt>
                    <dd>{{ refOnScreenBehind ? '（在相机后方 / 视锥外，无意义）' : `${fmt2(refCanvas.x)}, ${fmt2(refCanvas.y)}` }}</dd>
                </dl>
            </section>
        </aside>
    </div>
</template>

<script setup lang="ts">
// Vue：组件挂载/卸载生命周期，以及响应式状态（模板里显示的数值会随这里更新）
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue'
// 路由：模板里 <RouterLink> 需要
import { RouterLink } from 'vue-router'
// Three.js 核心：Scene、Camera、Vector、Raycaster、Plane 等
import * as THREE from 'three'
// 轨道控制器：旋转/缩放相机后，投影矩阵变了，世界→屏幕换算也要跟着变
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

// 指向包裹 canvas 的 DOM，用来取容器宽高、插入 renderer.domElement
const containerRef = ref<HTMLDivElement | null>(null)

// 鼠标在「canvas 元素局部坐标」下的像素位置（左上为 0,0，单位：CSS 像素）
const pointerCanvas = reactive({ x: 0, y: 0 })
// 射线与 y=0 地面求交后得到的三维世界坐标（Three 里默认世界单位可理解为米）
const worldOnPlane = reactive({ x: 0, y: 0, z: 0 })
// 把 worldOnPlane 再 project 回屏幕后得到的画布像素（用于和 pointerCanvas 对比）
const roundTripCanvas = reactive({ x: 0, y: 0 })
// 往返误差：roundTrip 与鼠标像素的直线距离（像素）
const roundTripErr = ref(0)
// 误差小于阈值则认为「数值上闭合」，浮点会有极小偏差属正常
const roundTripOk = ref(true)

/** 橙色参考球在世界里的位置；与 refMesh.position 保持一致，用于演示「世界 → 屏幕」 */
const refWorld = reactive({ x: 2.5, y: 0.35, z: 1.8 })
// 参考球投影到画布上的像素坐标（相对 canvas 左上）
const refCanvas = reactive({ x: 0, y: 0 })
// 点在相机后方时 project 无直观意义，用布尔量在面板提示
const refOnScreenBehind = ref(false)

// 数学上的平面：法线 (0,1,0) 表示平面朝上；常数 0 表示过原点、高度 y=0 的水平面
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
// 复用 Vector2，避免 pointermove 每秒触发很多次时频繁 new 对象（NDC 只有 x,y）
const ndc = new THREE.Vector2()
// 射线与平面交点写入此向量（世界坐标）
const hitWorld = new THREE.Vector3()
// Raycaster：内部会保存一条从相机出发的射线，供与平面/物体求交
const raycaster = new THREE.Raycaster()

// 面板显示用：保留一位小数
function fmt2(n: number) {
    return Number.isFinite(n) ? n.toFixed(1) : '—'
}

// 面板显示用：保留三位小数（世界坐标变化更细）
function fmt3(n: number) {
    return Number.isFinite(n) ? n.toFixed(3) : '—'
}

/**
 * 【屏幕像素 → NDC】
 * NDC（Normalized Device Coordinates）：裁剪空间归一化后的 xy，范围约 [-1,1]。
 * Three 的 Raycaster.setFromCamera 要求传入的就是 NDC：x 右为正，y 上为正。
 * 浏览器 clientY 向下增大，所以要取负号把「向下」变成 NDC 的「向上」。
 */
function clientToNDC(clientX: number, clientY: number, rect: DOMRect, out: THREE.Vector2) {
    // 先减 rect.left/top：把相对「视口」的坐标变成相对「canvas 元素」的坐标
    // 再除以 rect.width/height：得到 0~1 的比例（在画布内的相对位置）
    // *2-1：把 [0,1] 线性映射到 [-1,1]，得到 NDC 的 x
    const x = ((clientX - rect.left) / rect.width) * 2 - 1
    // y：比例同样映射到 [-1,1]，前面的负号把屏幕坐标系翻成 NDC（y 向上）
    const y = -((clientY - rect.top) / rect.height) * 2 + 1
    // 写入复用的 out，避免调用方每次 new Vector2
    out.set(x, y)
}

/**
 * 【世界坐标 → 画布 CSS 像素】
 * 步骤：世界点 → 乘 view-projection 矩阵 → 透视除法 → NDC → 再映射回0~w、0~h 的像素。
 * three里 `Vector3.project(camera)` 一次完成到 NDC（结果在 vector 的 x,y,z 里，x,y 常用）。
 */
function worldToCanvas(
    world: THREE.Vector3, // 世界空间中的点（与 scene 根节点同一套坐标）
    cam: THREE.PerspectiveCamera, // 当前用于渲染的相机（含位置、朝向、投影）
    w: number, // 画布 CSS 宽度（须与换算鼠标时用的宽度一致，一般用 clientWidth）
    h: number, // 画布 CSS 高度
    out: { x: number; y: number; behind: boolean } // 输出：像素 + 是否在相机后方
) {
    // 相机在世界中「看向」的单位方向向量（世界空间）
    const forward = new THREE.Vector3()
    // 填入相机局部 -Z 轴在世界中的方向（即视线方向）
    cam.getWorldDirection(forward)
    // 从相机位置指向世界点的向量
    const toPoint = new THREE.Vector3().subVectors(world, cam.position)
    // 点积 ≤ 0：夹角 ≥ 90°，点在相机背后或恰在相机平面上，屏幕投影不可靠
    out.behind = toPoint.dot(forward) <= 0
    if (out.behind) {
        // 不输出假像素坐标，模板里用 isFinite 显示「—」或提示文案
        out.x = NaN
        out.y = NaN
        return
    }
    // project：内部 world → clip →透视除法，得到 NDC；会修改克隆体 v的 x,y,z
    const v = world.clone().project(cam)
    // NDC 的 x 从 [-1,1] 映射到 [0,w]：-1→0，1→w
    out.x = (v.x * 0.5 + 0.5) * w
    // NDC 的 y 从 [-1,1] 映射到 [0,h]：canvas 像素 y 向下增大，与 NDC y 向上相反，故用 -v.y
    out.y = (-v.y * 0.5 + 0.5) * h
}

// 以下为 Three 运行时对象；卸载时置 null，避免悬空引用
let renderer: THREE.WebGLRenderer | null = null // WebGL 渲染器，对应一块 canvas
let scene: THREE.Scene | null = null // 场景图：灯光、网格、辅助线都加在这里
let camera: THREE.PerspectiveCamera | null = null // 透视相机：决定「怎么看」世界
let controls: OrbitControls | null = null // 轨道控制：用户拖动改变 camera 位姿
let onResize: (() => void) | null = null // 保存 resize 回调引用，卸载时 removeEventListener
let onPointerMove: ((e: PointerEvent) => void) | null = null // 同上，卸载时移除指针监听
let rafId = 0 // requestAnimationFrame 的 id，卸载时 cancelAnimationFrame
let hitMarker: THREE.Mesh | null = null // 绿色小球：标示射线打在地面上的世界点
let refMesh: THREE.Mesh | null = null // 橙色小球：固定世界坐标，用于演示 project

// 渲染循环：每帧更新阻尼控制器并 draw
function tick() {
    if (!renderer || !scene || !camera) return // 已卸载则不再渲染
    controls?.update() // 阻尼模式下每帧需要 update 才平滑
    renderer.render(scene, camera) // 当前相机视角绘制整个 scene
    rafId = requestAnimationFrame(tick) // 下一帧继续
}

// 相机或画布尺寸变化后，重新计算「参考球」在屏幕上的像素位置（供右侧面板显示）
function updateRefScreen() {
    if (!camera || !renderer) return
    const canvas = renderer.domElement // 实际绘制的 <canvas>
    const w = canvas.clientWidth // CSS 布局宽度（与 setSize 使用的逻辑尺寸一致时最稳妥）
    const h = canvas.clientHeight
    const tmp = new THREE.Vector3(refWorld.x, refWorld.y, refWorld.z) // 参考点世界坐标
    const out = { x: 0, y: 0, behind: false } // 接收 worldToCanvas 的输出
    worldToCanvas(tmp, camera, w, h, out) // 世界 → 画布像素
    refOnScreenBehind.value = out.behind || !Number.isFinite(out.x) // 后方或 NaN 时 UI 提示
    refCanvas.x = out.x // 同步到 reactive，模板自动更新
    refCanvas.y = out.y
}

onMounted(() => {
    const el = containerRef.value // 挂载点：.stage 容器
    if (!el) return // 理论上不会发生，防御性判断
    const width = el.clientWidth // 初始画布逻辑宽
    const height = el.clientHeight // 初始画布逻辑高

    scene = new THREE.Scene() // 新建空场景
    scene.background = new THREE.Color('#222233') // 清屏底色

    const nearM = 0.1 // 近裁剪面：比此更近的不画（米）
    const farM = 500 // 远裁剪面：比此更远的不画
    // 透视相机：竖直视野角 50°、宽高比、近远面；须与 renderer 尺寸一起更新 aspect
    camera = new THREE.PerspectiveCamera(50, width / height, nearM, farM)
    camera.position.set(6, 5, 8) // 相机在世界中的位置
    camera.lookAt(0, 0, 0) // 朝向世界原点（初次朝向；之后 OrbitControls 会改）

    renderer = new THREE.WebGLRenderer({ antialias: true }) // 抗锯齿
    renderer.setPixelRatio(window.devicePixelRatio) // 高分屏用物理像素绘制，避免糊
    renderer.setSize(width, height) // 缓冲尺寸 = 容器 CSS 尺寸（与 clientWidth/Height 对齐）
    el.appendChild(renderer.domElement) // canvas 放进 DOM

    scene.add(new THREE.AxesHelper(4)) // 红绿蓝三轴，帮助理解世界方向
    scene.add(new THREE.GridHelper(20, 20, 0x444466, 0x333344)) // 地面网格，对应 y=0 附近

    const ambient = new THREE.AmbientLight(0xffffff, 0.4) // 环境光：整体提亮
    scene.add(ambient)
    const sun = new THREE.DirectionalLight(0xffffff, 1.1) // 平行光：产生明暗
    sun.position.set(4, 10, 6) // 光源位置（仅决定方向）
    scene.add(sun)

    const hitMat = new THREE.MeshStandardMaterial({ color: 0x44dd88, roughness: 0.35, metalness: 0.1 })
    hitMarker = new THREE.Mesh(new THREE.SphereGeometry(0.12, 24, 24), hitMat) // 绿色交点标记
    hitMarker.position.set(0, 0.12, 0) // 略高于地面，避免与网格 z-fight
    scene.add(hitMarker)

    const refMat = new THREE.MeshStandardMaterial({ color: 0xff9944, roughness: 0.35, metalness: 0.1 })
    refMesh = new THREE.Mesh(new THREE.SphereGeometry(0.18, 24, 24), refMat) // 橙色参考球
    refMesh.position.set(refWorld.x, refWorld.y, refWorld.z) // 与 refWorld 数值一致
    scene.add(refMesh)

    controls = new OrbitControls(camera, renderer.domElement) // 监听 canvas 上的拖拽
    controls.enableDamping = true // 惯性阻尼，松手后慢慢停
    controls.target.set(0, 0, 0) // 环绕观察的目标点（轨道中心）
    controls.addEventListener('change', updateRefScreen) // 任意视角变化后刷新「参考球→屏幕」读数

    // 指针移动：核心坐标换算演示
    onPointerMove = (e: PointerEvent) => {
        if (!camera || !renderer) return
        const canvas = renderer.domElement
        const rect = canvas.getBoundingClientRect() // canvas 在视口中的位置与 CSS 尺寸（含缩放）
        const w = canvas.clientWidth // 与 project 映射到像素时用的宽高一致
        const h = canvas.clientHeight

        // 鼠标相对 canvas 左上角的 CSS 像素（与 worldToCanvas 输出的坐标系一致）
        const cx = e.clientX - rect.left
        const cy = e.clientY - rect.top
        pointerCanvas.x = cx // 给面板显示「屏幕/画布坐标」
        pointerCanvas.y = cy

        // 用视口坐标 + rect 换算 NDC，写入复用的 ndc
        clientToNDC(e.clientX, e.clientY, rect, ndc)
        // 从相机通过该 NDC 点向场景发射一条射线（存在 raycaster.ray 里）
        raycaster.setFromCamera(ndc, camera)
        // 与水平面 groundPlane 求交；成功则 hitWorld 为交点世界坐标，失败则 ok 为 null
        const ok = raycaster.ray.intersectPlane(groundPlane, hitWorld)
        if (ok) {
            worldOnPlane.x = hitWorld.x // 交点在世界坐标系中的 x
            worldOnPlane.y = hitWorld.y // 理论上为 0（在 y=0 平面上）
            worldOnPlane.z = hitWorld.z
            if (hitMarker) {
                hitMarker.position.set(hitWorld.x, 0.12, hitWorld.z) // 可视化交点
            }
            const back = { x: 0, y: 0, behind: false }
            worldToCanvas(hitWorld, camera, w, h, back) // 同一点再投回屏幕
            roundTripCanvas.x = back.x // 应与 (cx, cy) 几乎相同
            roundTripCanvas.y = back.y
            const dx = back.x - cx // 往返 x 误差
            const dy = back.y - cy // 往返 y 误差
            roundTripErr.value = Math.hypot(dx, dy) // 欧氏距离（像素）
            roundTripOk.value = roundTripErr.value < 0.8 // 允许亚像素级浮点误差
        }
    }
    renderer.domElement.addEventListener('pointermove', onPointerMove)

    // 窗口或布局变化：同步相机 aspect与渲染缓冲大小，否则画面拉伸、换算也会错
    onResize = () => {
        if (!renderer || !camera || !el) return
        const w = el.clientWidth
        const h = el.clientHeight
        camera.aspect = w / h // 透视投影的宽高比必须等于画布宽高比
        camera.updateProjectionMatrix() // 修改 aspect 后必须更新投影矩阵
        renderer.setSize(w, h) // GL 缓冲与 CSS 显示尺寸一致
        updateRefScreen() // 尺寸变了，参考球在屏幕上的像素也变
    }
    window.addEventListener('resize', onResize!)

    updateRefScreen() // 首帧前算一次参考球屏幕坐标
    rafId = requestAnimationFrame(tick) // 启动渲染循环
})

onBeforeUnmount(() => {
    cancelAnimationFrame(rafId) // 停止 requestAnimationFrame
    controls?.removeEventListener('change', updateRefScreen) // 去掉控制器回调
    controls?.dispose() // 释放控制器内部监听
    controls = null
    if (renderer && onPointerMove) {
        renderer.domElement.removeEventListener('pointermove', onPointerMove) // 去掉指针监听
    }
    onPointerMove = null
    if (onResize) window.removeEventListener('resize', onResize) // 去掉窗口监听
    onResize = null
    hitMarker = null // 断开对 mesh 的引用（几何/材质在下面 traverse 里 dispose）
    refMesh = null
    const el = containerRef.value
    if (renderer && el && renderer.domElement.parentElement === el) {
        el.removeChild(renderer.domElement) // 从 DOM 移除 canvas
    }
    renderer?.dispose() // 释放 WebGL 上下文相关资源
    scene?.traverse((obj: THREE.Object3D) => {
        // 遍历场景，释放 GPU 上的几何与材质
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
})
</script>

<style scoped>
.page {
    display: flex;
    min-height: 100vh;
    background: #1a1a28;
    color: #e8e8f0;
    font-family: system-ui, sans-serif;
}

.stage {
    flex: 1;
    min-width: 0;
    min-height: 100vh;
}

.panel {
    width: min(380px, 42vw);
    flex-shrink: 0;
    padding: 20px 18px 24px;
    border-left: 1px solid #3a3a55;
    background: #161622;
    overflow: auto;
}

.panel-title {
    margin: 0 0 10px;
    font-size: 1.15rem;
    font-weight: 700;
}

.hint {
    margin: 0 0 14px;
    font-size: 13px;
    line-height: 1.55;
    opacity: 0.92;
}

.hint code {
    font-size: 12px;
    padding: 1px 5px;
    border-radius: 4px;
    background: #2a2a40;
}

.back {
    display: inline-block;
    margin-bottom: 18px;
    color: #66aaff;
    text-decoration: none;
    font-weight: 600;
    font-size: 14px;
}

.back:hover {
    text-decoration: underline;
}

.block {
    margin-bottom: 18px;
    padding: 12px 12px 14px;
    background: #1e1e30;
    border: 1px solid #353550;
    border-radius: 8px;
}

.block h2 {
    margin: 0 0 8px;
    font-size: 13px;
    font-weight: 600;
    color: #b8b8d8;
}

.sub {
    margin: 0 0 8px;
    font-size: 12px;
    opacity: 0.85;
}

.kv {
    margin: 0;
    font-size: 13px;
}

.kv dt {
    margin-top: 8px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #8888aa;
}

.kv dt:first-child {
    margin-top: 0;
}

.kv dd {
    margin: 4px 0 0;
    font-family: ui-monospace, monospace;
    font-size: 13px;
}

.ok {
    color: #6d6;
    font-family: system-ui, sans-serif;
    font-size: 12px;
}

.warn {
    color: #fa6;
    font-family: system-ui, sans-serif;
    font-size: 12px;
}
</style>
