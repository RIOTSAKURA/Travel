# Travel Routes

展示旅行计划路线的静态网站，基于 Leaflet 1.9.4 + 高德地图瓦片，暖色纸质风格界面。

> 参考设计：[oceans-penguin.github.io/daxinganling](https://oceans-penguin.github.io/daxinganling/)

## 特性

- **无需 API Key**：直接使用高德瓦片服务
- **路线数据外置 JSON**：每条路线独立存放在 `routes/` 文件夹，便于管理和新增
- **暖色纸质风格**：奶油色背景 + 卡片式布局 + 彩色圆形标记
- **多路线切换**：Tab 切换不同旅行路线
- **决策点交互**：地图上彩色圆点可点击弹出下拉菜单选择方案
- **已取消点位**：虚线圆环标注被取消的途经点
- **路线连线**：白色描边 + 彩色路线的折线，沿实际道路走向绘制
- **图层切换**：右上角切换 行政区划图 / 影像地形图 / 道路标注
- **比例尺控件**：右下角实时比例尺
- **GCJ-02 自动纠偏**：JSON 中使用 WGS84 坐标，渲染时自动转换为高德 GCJ-02 坐标系
- **KPI 卡片 + 日程表**：侧栏显示行程统计和逐日安排
- **响应式布局**：移动端自动切换为单列

## 文件结构

```
Travel/
├── index.html              # 主页面
├── style.css               # 暖色纸质主题样式
├── config.js               # 站点级配置（标题 + 路线文件清单）
├── app.js                  # Leaflet 地图初始化与交互逻辑
├── routes/                 # 路线数据目录（每条路线一个 JSON 文件）
│   ├── silk_road.json      # 丝绸之路
│   └── tibet_journey.json  # 川藏南线
└── README.md
```

## 快速开始

### 1. 编辑站点配置

打开 `config.js`，修改标题和路线文件清单：

```javascript
const TRAVEL_CONFIG = {
  title: "我的旅行计划",
  subtitle: "...",
  routeFiles: [
    "routes/silk_road.json",
    "routes/tibet_journey.json"
  ]
};
```

### 2. 编辑路线数据

每条路线是一个独立的 JSON 文件，放在 `routes/` 目录下。支持以下字段：

| 字段 | 必填 | 说明 |
|------|------|------|
| `id` | 是 | 路线唯一标识 |
| `name` | 是 | 路线名称（显示在 Tab 上） |
| `color` | 是 | 路线主色（HEX，如 `#C07D00`） |
| `colorSoft` | 否 | 浅色背景（用于 chips） |
| `description` | 否 | 路线描述 |
| `kpis` | 否 | 统计卡片数组 `[{value, label}]` |
| `stops` | 是 | 固定途经点数组 `[{name, lat, lng, day, info}]` |
| `options` | 否 | 决策点数组 `[{id, name, type, lat, lng, title, when, sel, def}]` |
| `canceled` | 否 | 已取消点位 `[{name, lat, lng, reason}]` |
| `corridor` | 是 | 路线折线坐标 `[[lat,lng], ...]`（WGS84） |
| `days` | 否 | 日程表 `[{day, route, highlight}]` |

**type 值**：`amber`（可选，琥珀色）/ `rust`（应急，铁锈红）/ `blue`（返程，蓝色）

### 3. 新增路线

1. 复制 `routes/` 下任意一个 JSON 文件作为模板
2. 修改内容（路线名、坐标、站点等）
3. 在 `config.js` 的 `routeFiles` 数组中添加新文件路径

### 4. 本地预览

```bash
python3 -m http.server 8000
```

浏览器访问 `http://localhost:8000`。

### 5. 部署到 GitHub Pages

```bash
git add .
git commit -m "Travel route map with Leaflet + Gaode tiles"
git push origin main
```

仓库 Settings → Pages → Source 选择 `main` 分支 → Save。

## 技术说明

- **地图引擎**：Leaflet 1.9.4（通过 unpkg CDN 加载）
- **瓦片服务**：高德地图瓦片（`is.autonavi.com`），无需 Key
- **数据加载**：`app.js` 启动时通过 `fetch()` 异步加载 `routes/*.json`
- **坐标转换**：JSON 中的 WGS84 坐标在渲染时自动通过 `toGCJ02()` 转换为 GCJ-02
- **标记**：`L.circleMarker` 双层模式（18px 透明热区 + 彩色圆点）
- **路线**：`densify()` 对 corridor 坐标插值加密（n=8）后转换 GCJ-02
