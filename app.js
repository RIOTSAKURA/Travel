/**
 * Travel Route Map Application
 * Uses Leaflet 1.9.4 + Gaode (Amap) tile layers.
 * Route data is loaded from JSON files in the routes/ directory.
 * Coordinates in JSON files are WGS84; auto-converted to GCJ-02 for Gaode tiles.
 */

(function () {
  "use strict";

  if (typeof L === "undefined") {
    document.getElementById("map").innerHTML =
      '<div style="display:flex;align-items:center;justify-content:center;' +
      "height:100%;color:#8C2E1E;font-size:14px;text-align:center;padding:40px;\">" +
      "地图加载失败：Leaflet 库未加载，请检查网络连接" +
      "</div>";
    return;
  }

  var map = null;
  var routesCache = [];
  var currentRouteId = null;
  var state = {};
  var layerGroup = null;
  var connectLayer = null;

  var COLORS = {
    amber: "#C07D00",
    rust: "#8C2E1E",
    blue: "#2A6AA6",
    ink: "#3D3628",
    cancel: "#9A927E"
  };

  // ── WGS84 → GCJ-02 coordinate conversion ──────────────
  function transformLat(x, y) {
    var ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
    ret += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(y * Math.PI) + 40.0 * Math.sin(y / 3.0 * Math.PI)) * 2.0 / 3.0;
    ret += (160.0 * Math.sin(y / 12.0 * Math.PI) + 320 * Math.sin(y * Math.PI / 30.0)) * 2.0 / 3.0;
    return ret;
  }

  function transformLng(x, y) {
    var ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
    ret += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(x * Math.PI) + 40.0 * Math.sin(x / 3.0 * Math.PI)) * 2.0 / 3.0;
    ret += (150.0 * Math.sin(x / 12.0 * Math.PI) + 300.0 * Math.sin(x / 30.0 * Math.PI)) * 2.0 / 3.0;
    return ret;
  }

  function toGCJ02(lat, lng) {
    var a = 6378245.0, ee = 0.00669342162296594323;
    var dLat = transformLat(lng - 105.0, lat - 35.0);
    var dLng = transformLng(lng - 105.0, lat - 35.0);
    var radLat = lat / 180.0 * Math.PI;
    var magic = Math.sin(radLat);
    magic = 1 - ee * magic * magic;
    var sqrtMagic = Math.sqrt(magic);
    dLat = (dLat * 180.0) / ((a * (1 - ee)) / (magic * sqrtMagic) * Math.PI);
    dLng = (dLng * 180.0) / (a / sqrtMagic * Math.cos(radLat) * Math.PI);
    return [lat + dLat, lng + dLng];
  }

  function densify(pts, n) {
    var out = [];
    for (var i = 0; i < pts.length - 1; i++) {
      var la1 = pts[i][0], ln1 = pts[i][1], la2 = pts[i + 1][0], ln2 = pts[i + 1][1];
      for (var k = 0; k < n; k++) {
        out.push(toGCJ02(la1 + (la2 - la1) * k / n, ln1 + (ln2 - ln1) * k / n));
      }
    }
    var last = pts[pts.length - 1];
    out.push(toGCJ02(last[0], last[1]));
    return out;
  }

  // ── Load route JSON files ─────────────────────────────
  function loadRoutes() {
    var files = TRAVEL_CONFIG.routeFiles || [];
    var promises = files.map(function (file) {
      return fetch(file).then(function (res) {
        if (!res.ok) throw new Error("Failed to load " + file + ": " + res.status);
        return res.json();
      }).catch(function (err) {
        console.error(err);
        return null;
      });
    });
    return Promise.all(promises).then(function (results) {
      routesCache = results.filter(function (r) { return r !== null; });
    });
  }

  // ── Map initialization ────────────────────────────────
  function initMap() {
    map = L.map("map", { zoomControl: true });

    var gdStreet = L.tileLayer(
      "https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}",
      { attribution: "© 高德地图", subdomains: "1234", maxZoom: 18 }
    );
    var gdSat = L.tileLayer(
      "https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}",
      { attribution: "© 高德地图", subdomains: "1234", maxZoom: 18 }
    );
    var gdRoad = L.tileLayer(
      "https://webst0{s}.is.autonavi.com/appmaptile?style=8&x={x}&y={y}&z={z}",
      { attribution: "© 高德地图", subdomains: "1234", maxZoom: 18 }
    );

    gdStreet.addTo(map);
    gdRoad.addTo(map);

    L.control.layers(
      { "高德·行政区划图": gdStreet, "高德·影像地形图": gdSat },
      { "高德·道路标注": gdRoad },
      { position: "topright", collapsed: false }
    ).addTo(map);

    L.control.scale({ position: "bottomright" }).addTo(map);

    layerGroup = L.layerGroup().addTo(map);
    connectLayer = L.layerGroup().addTo(map);
  }

  // ── Marker styling ────────────────────────────────────
  function styleFor(type, routeColor) {
    if (type === "cancel") {
      return { radius: 8, color: COLORS.cancel, weight: 2, fillOpacity: 0, dashArray: "4 3" };
    }
    if (type === "ink") {
      return { radius: 8, color: "#fff", weight: 2, fillColor: routeColor || COLORS.ink, fillOpacity: 1 };
    }
    return { radius: 10, color: "#fff", weight: 2, fillColor: COLORS[type], fillOpacity: 1 };
  }

  function addMarker(latlng, style, popupHTML) {
    var hit = L.circleMarker(latlng, { radius: 18, stroke: false, opacity: 0, fillOpacity: 0 });
    hit.bindPopup(popupHTML);
    hit.addTo(layerGroup);

    var vis = L.circleMarker(latlng, style).addTo(layerGroup);
    vis.on("click", function () { hit.openPopup(); });
    vis.on("mouseover", function () { vis.setStyle({ weight: 3 }); });
    vis.on("mouseout", function () { vis.setStyle(style); });

    return { hit: hit, vis: vis };
  }

  // ── Popup HTML builders ───────────────────────────────
  function fixedPopupHTML(stop) {
    return '<h3>' + stop.name + '</h3>' +
      '<div class="d">' + stop.day + '</div>' +
      '<div class="info">' + (stop.info || "") + '</div>';
  }

  function canceledPopupHTML(stop) {
    return '<h3>已取消：' + stop.name + '</h3>' +
      '<div class="info">' + stop.reason + '</div>';
  }

  function optionPopupHTML(option) {
    var cur = option.sel.find(function (s) { return s.v === state[option.id]; });
    if (!cur) cur = option.sel[0];
    return '<h3>' + option.title + '</h3>' +
      '<div class="d">' + option.day + ' · ' + option.when + '</div>' +
      '<select id="pop-' + option.id + '">' +
      option.sel.map(function (s) { return '<option value="' + s.v + '">' + s.t + '</option>'; }).join("") +
      '</select>' +
      '<div class="info" id="popinfo-' + option.id + '">' + cur.i + '</div>';
  }

  // ── Route rendering ───────────────────────────────────
  function findNearestStop(route, option) {
    if (!route.stops || route.stops.length === 0) return null;
    var nearest = route.stops[0];
    var minDist = Infinity;
    route.stops.forEach(function (stop) {
      var dist = Math.pow(stop.lat - option.lat, 2) + Math.pow(stop.lng - option.lng, 2);
      if (dist < minDist) {
        minDist = dist;
        nearest = stop;
      }
    });
    return nearest;
  }

  function renderConnectLines(route) {
    connectLayer.clearLayers();
    if (!route.options) return;
    route.options.forEach(function (option) {
      var cur = option.sel.find(function (s) { return s.v === state[option.id]; });
      if (!cur || !cur.connect) return;
      var nearest = findNearestStop(route, option);
      if (!nearest) return;
      L.polyline(
        [toGCJ02(nearest.lat, nearest.lng), toGCJ02(option.lat, option.lng)],
        {
          color: COLORS[option.type] || route.color,
          weight: 3,
          opacity: 0.7,
          dashArray: "8 6",
          lineJoin: "round"
        }
      ).addTo(connectLayer);
    });
  }

  function renderRoute(route) {
    layerGroup.clearLayers();

    if (route.corridor && route.corridor.length >= 2) {
      var mainLine = densify(route.corridor, 8);
      L.polyline(mainLine, {
        color: "#FFFFFF", weight: 9, opacity: 0.9, lineJoin: "round"
      }).addTo(layerGroup);
      L.polyline(mainLine, {
        color: route.color, weight: 4.5, opacity: 1, lineJoin: "round"
      }).addTo(layerGroup);
    }

    if (route.stops) {
      route.stops.forEach(function (stop) {
        addMarker(
          toGCJ02(stop.lat, stop.lng),
          styleFor("ink", route.color),
          fixedPopupHTML(stop)
        );
      });
    }

    if (route.canceled) {
      route.canceled.forEach(function (stop) {
        addMarker(
          toGCJ02(stop.lat, stop.lng),
          styleFor("cancel"),
          canceledPopupHTML(stop)
        );
      });
    }

    if (route.options) {
      route.options.forEach(function (option) {
        state[option.id] = option.def;
        addMarker(
          toGCJ02(option.lat, option.lng),
          styleFor(option.type),
          function () { return optionPopupHTML(option); }
        );
      });
    }

    var bounds = L.latLngBounds([]);
    if (route.stops) {
      route.stops.forEach(function (s) {
        bounds.extend(toGCJ02(s.lat, s.lng));
      });
    }
    if (route.options) {
      route.options.forEach(function (o) {
        bounds.extend(toGCJ02(o.lat, o.lng));
      });
    }
    if (route.corridor && route.corridor.length >= 2) {
      route.corridor.forEach(function (p) {
        bounds.extend(toGCJ02(p[0], p[1]));
      });
    }
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [30, 30] });
    }

    renderConnectLines(route);
  }

  // ── Popup open: wire select dropdowns ─────────────────
  function onPopupOpen(e) {
    var selEl = e.popup.getElement().querySelector("select");
    if (!selEl) return;
    var oid = selEl.id.replace("pop-", "");
    var route = findRoute(currentRouteId);
    if (!route || !route.options) return;
    var option = route.options.find(function (o) { return o.id === oid; });
    if (!option) return;
    selEl.value = state[oid];
    selEl.onchange = function () {
      state[oid] = selEl.value;
      syncSidebar(route, oid);
    };
  }

  // ── Sidebar rendering ─────────────────────────────────
  function renderSidebar(route) {
    renderKPIs(route);
    renderCards(route);
    renderDaysTable(route);
    renderChips(route);
    syncSidebar(route, null);
  }

  function renderKPIs(route) {
    var container = document.getElementById("kpis");
    container.innerHTML = "";
    if (route.kpis) {
      route.kpis.forEach(function (kpi) {
        container.insertAdjacentHTML("beforeend",
          '<div class="kpi"><b>' + kpi.value + '</b><span>' + kpi.label + '</span></div>');
      });
    }
  }

  function renderCards(route) {
    var container = document.getElementById("cards");
    container.innerHTML = "";

    if (route.description) {
      container.insertAdjacentHTML("beforeend",
        '<div class="card"><h3>' + route.name + '</h3>' +
        '<div class="info" style="border-top:none;padding-top:0;margin-top:0;">' +
        route.description + '</div></div>');
    }

    if (route.options) {
      route.options.forEach(function (option) {
        var cls = option.type === "amber" ? "b-amber" :
                  option.type === "rust" ? "b-rust" : "b-blue";
        var label = option.type === "amber" ? "可选" :
                    option.type === "rust" ? "应急" : "返程";
        container.insertAdjacentHTML("beforeend",
          '<div class="card" id="card-' + option.id + '">' +
          '<h3><span class="badge ' + cls + '">' + label + '</span>' + option.name + '</h3>' +
          '<div class="d">' + option.day + ' · ' + option.when + '</div>' +
          '<select data-oid="' + option.id + '">' +
          option.sel.map(function (s) { return '<option value="' + s.v + '">' + s.t + '</option>'; }).join("") +
          '</select>' +
          '<div class="info" id="info-' + option.id + '"></div>' +
          '</div>');
      });

      container.querySelectorAll("select").forEach(function (sel) {
        sel.addEventListener("change", function () {
          state[sel.dataset.oid] = sel.value;
          syncSidebar(route, sel.dataset.oid);
        });
      });
    }
  }

  function renderDaysTable(route) {
    var table = document.getElementById("days-table");
    table.innerHTML = "<tr><th>天</th><th>路线</th><th>里程</th><th>亮点 / 决策</th></tr>";
    if (route.days) {
      route.days.forEach(function (d) {
        table.insertAdjacentHTML("beforeend",
          "<tr><td>" + d.day + "</td><td>" + d.route + "</td><td>" + (d.distance || "—") + "</td><td>" + d.highlight + "</td></tr>");
        });
    }
  }

  function renderChips(route) {
    var chips = [];
    if (route.options) {
      route.options.forEach(function (option) {
        var cur = option.sel.find(function (s) { return s.v === state[option.id]; });
        if (!cur) cur = option.sel[0];
        var cls = option.type === "amber" ? "c-amber" :
                  option.type === "rust" ? "c-rust" : "c-blue";
        chips.push('<span class="chip ' + cls + '"><b>' + option.name +
          '</b>：' + cur.t + "</span>");
      });
    }
    if (chips.length === 0) {
      chips.push('<span class="chip"><b>' + route.name + '</b>：共 ' +
        (route.stops ? route.stops.length : 0) + " 站</span>");
    }
    document.getElementById("chips").innerHTML = chips.join("");
  }

  function syncSidebar(route, fromId) {
    if (route.options) {
      route.options.forEach(function (option) {
        var sel = document.querySelector('#cards select[data-oid="' + option.id + '"]');
        if (sel) {
          sel.value = state[option.id];
          var cur = option.sel.find(function (s) { return s.v === state[option.id]; });
          var infoEl = document.getElementById("info-" + option.id);
          if (cur && infoEl) infoEl.textContent = cur.i;
        }
      });
    }
    renderChips(route);
    renderConnectLines(route);
    if (fromId) {
      var card = document.getElementById("card-" + fromId);
      if (card) card.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  // ── Route tabs ─────────────────────────────────────────
  function renderRouteTabs() {
    var container = document.getElementById("route-tabs");
    container.innerHTML = "";
    routesCache.forEach(function (route) {
      var tab = document.createElement("button");
      tab.className = "route-tab";
      tab.textContent = route.name;
      tab.style.setProperty("--tab-color", route.color || "#C07D00");
      tab.addEventListener("click", function () { selectRoute(route.id); });
      container.appendChild(tab);
    });
  }

  function selectRoute(routeId) {
    currentRouteId = routeId;
    if (location.hash !== "#" + routeId) {
      location.hash = routeId;
    }
    document.querySelectorAll(".route-tab").forEach(function (tab, i) {
      tab.classList.toggle("active", routesCache[i].id === routeId);
    });
    var route = findRoute(routeId);
    if (!route) return;
    state = {};
    document.documentElement.style.setProperty("--route-color", route.color || "#C07D00");
    var wm = document.getElementById("map-watermark");
    if (wm) wm.textContent = route.name;
    renderRoute(route);
    renderSidebar(route);
  }

  function findRoute(routeId) {
    return routesCache.find(function (r) { return r.id === routeId; });
  }

  // ── Accordion toggle ──────────────────────────────────
  function initAccordion() {
    document.querySelectorAll(".accordion-header").forEach(function (header) {
      header.addEventListener("click", function () {
        var acc = header.parentElement;
        acc.classList.toggle("collapsed");
      });
    });
  }

  // ── Boot ──────────────────────────────────────────────
  document.getElementById("travel-title").firstChild.textContent =
    TRAVEL_CONFIG.title || "旅行路线";
  document.getElementById("travel-subtitle").textContent =
    TRAVEL_CONFIG.subtitle || "";

  initMap();
  map.on("popupopen", onPopupOpen);
  initAccordion();

  window.addEventListener("hashchange", function () {
    var hashId = location.hash.replace(/^#/, "");
    if (hashId && hashId !== currentRouteId && findRoute(hashId)) {
      selectRoute(hashId);
    }
  });

  loadRoutes().then(function () {
    renderRouteTabs();
    var hashId = location.hash.replace(/^#/, "");
    var initialId = (hashId && findRoute(hashId)) ? hashId : (routesCache.length > 0 ? routesCache[0].id : null);
    if (initialId) {
      selectRoute(initialId);
    } else {
      document.getElementById("cards").innerHTML =
        '<div class="card"><div class="info">未加载到任何路线数据，请检查 routes/ 目录中的 JSON 文件。</div></div>';
    }
  });
})();
