/**
 * Site-level configuration (route data lives in routes/*.json)
 * --------------------------------------------------------------------
 * To add a new route:
 *   1. Create routes/<your_route>.json (copy an existing file as template)
 *   2. Add the filename to the routeFiles array below
 */

const TRAVEL_CONFIG = {
  title: "旅行线路图",
  subtitle: "地图可缩放拖动，点击圆点查看详情",

  routeFiles: [
    "routes/lijiang_shangrila.json",
    "routes/southeast_tibet.json",
    "routes/chuanxi_loop.json",
    "routes/gannan_loop.json"
  ]
};
