export class MapManager {
  constructor(mapId, config = {}) {
    const defaultConfig = {
      center: [50.07664725280831, 14.41758155822754],
      initialZoom: 8,
      minZoom: 6,
      maxZoom: 22,
      markerRadius: 7,
    };

    this.config = { ...defaultConfig, ...config };
    this.map = L.map(mapId, {
      maxZoom: this.config.maxZoom,
      minZoom: this.config.minZoom,
    }).setView(this.config.center, this.config.initialZoom);

    this.markersLayer = L.layerGroup().addTo(this.map);
    this.lineLayer = L.layerGroup().addTo(this.map);
    this.events = new L.Evented();
    
    this._setSearchBar();
    this._initBaseLayers();
    this._bindMapEvents();
  }

  on(event, callback) {
    this.events.on(event, callback);
  }

  displayGpxTrack(gpxString) {
    try {
      const coords = this._parseGpx(gpxString);
      if (coords.length === 0) {
        this.events.fire("gpxLoadError", {
          error: "No points found in GPX file",
        });
        return;
      }

      this.events.fire("gpxPointsLoaded", { coords });

      const bounds = L.latLngBounds(coords.map((c) => [c.lat, c.lng]));
      if (bounds.isValid()) {
        this.map.fitBounds(bounds.pad(0.1));
      }
    } catch (error) {
      this.events.fire("gpxLoadError", { error: error.message });
    }
  }

  createMarker(lat, lng, index, totalPoints) {
    let fillColor = "#007bff"; // Default blue

    // Set colors for start and end points
    if (index === 0)
      fillColor = "#28a745"; // Start = Green
    else if (index === totalPoints - 1 && totalPoints > 1)
      fillColor = "#dc3545"; // End = Red

    const marker = L.marker([lat, lng], {
      icon: this._createCircleIcon(this.config.markerRadius, fillColor),
      draggable: true,
    }).addTo(this.markersLayer);

    marker.fillColor = fillColor;

    marker
      .on("dragstart", (e) =>
        this.events.fire("markerDragStart", { marker: e.target }),
      )
      .on("dragend", (e) =>
        this.events.fire("markerDragEnd", { marker: e.target }),
      )
      .on("contextmenu", (e) =>
        this.events.fire("markerRightClick", {
          marker: e.target,
          latlng: e.latlng,
          originalEvent: e.originalEvent,
        }),
      );

    return marker;
  }

  clearAllMarkers() {
    this.markersLayer.clearLayers();
  }

  drawPath(coords) {
    const pathLayer = L.polyline(coords, {
      color: "#ff7800",
      weight: 5,
      opacity: 0.8,
    }).addTo(this.lineLayer);

    pathLayer.on("mouseover", (e) => 
      e.target.setStyle({
        color: "#00ccffb6",
        weight: 5,
        opacity: 0.8,
      })
    )
    .on("mouseout", (e) => 
      e.target.setStyle({
        color: "#ff7800",
        weight: 5,
        opacity: 0.8,
      })
    )
    .on("click", (e) => {
      this.events.fire("lineClick", {
        polyline: e.target, 
        latlng: e.latlng,
      });
      L.DomEvent.stopPropagation(e);
      return;
    });
    // if (this.pathLayer.getBounds().isValid()) {
    //   this.map.fitBounds(this.pathLayer.getBounds().pad(0.1));
    // }
  }

  clearPath() {
    this.lineLayer.clearLayers();
  }

  showPopup(latlng, content) {
    L.popup({ closeButton: false, offset: [0, -10] })
      .setLatLng(latlng)
      .setContent(content)
      .openOn(this.map);
  }

  closeAllPopups() {
    this.map.closePopup();
  }

  setMarkerStyle(marker, fillColor) {
    marker.fillColor = fillColor;
    marker.setIcon(this._createCircleIcon(this.config.markerRadius, fillColor));
  }

  toggleMapInteraction(enable) {
    if (enable) this.map.dragging.enable();
    else this.map.dragging.disable();
  }

  _parseGpx(gpxString) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(gpxString, "application/xml");

    if (xmlDoc.querySelector("parsererror")) {
      throw new Error("Invalid GPX format");
    }

    const nodes = xmlDoc.querySelectorAll("wpt, trkpt");
    const points = [];

    nodes.forEach((node) => {
      const lat = parseFloat(node.getAttribute("lat"));
      const lon = parseFloat(node.getAttribute("lon"));
      if (!isNaN(lat) && !isNaN(lon)) {
        points.push({ lat, lng: lon });
      }
    });

    return points;
  }

  _createCircleIcon(radius, fillColor) {
    return L.divIcon({
      className: "custom-circle-marker",
      html: `<div style="width:${radius * 2}px; height:${radius * 2}px; background-color:${fillColor}; border:2px solid white; border-radius:50%;"></div>`,
      iconSize: [radius * 2 + 4, radius * 2 + 4],
      iconAnchor: [radius + 2, radius + 2],
    });
  }

  _setSearchBar(){//beg 9:10
    const apiKey_seznam = document.body.dataset.apikey_seznam || ""
    const inputElem = document.querySelector("#autoComplete");
    // cache - [key: query] = suggest items
    const queryCache = {};
    // get items by query
    const getItems = async(query) => {
      if (queryCache[query]) {
        return queryCache[query];
      }
      
      try {
        const fetchData = await fetch(`https://api.mapy.cz/v1/suggest?lang=cs&limit=5&type=regional&type=poi&preferNear&apikey=${apiKey_seznam}&query=${query}`);//input parametrs of suggest
        const jsonData = await fetchData.json();
        // map values to { value, data }
        const items = jsonData.items.map(item => ({
          value: item.name,
          data: item,
        }));
        
        // save to cache
        queryCache[query] = items;
        
        return items;
      } catch (exc) {
        return [];
      }
    };

    const autoCompleteJS = new autoComplete({
      selector: () => inputElem,
      placeHolder: "Search..",
      searchEngine: (query, record) => `<mark>${record}</mark>`,
      data: {
        keys: ["value"],
        src: async(query) => {
          // get items for current query
          const items = await getItems(query);
          if (queryCache[inputElem.value]) {
            return queryCache[inputElem.value];
          }
          
          return items;
        },
        cache: false,
      },
      resultItem: {
        element: (item, data) => {
          const itemData = data.value.data;
          const desc = document.createElement("div");
          
          desc.style = "overflow: hidden; white-space: nowrap; text-overflow: ellipsis;";
          desc.innerHTML = `${itemData.label}, ${itemData.location}`;
          item.append(
            desc,
          );
        },
        highlight: true
      },
      resultsList: {
        element: (list, data) => {
          list.style.maxHeight = "max-content";
          list.style.overflow = "hidden";
        
          if (!data.results.length) {
            const message = document.createElement("div");
            
            message.setAttribute("class", "no_result");
            message.style = "padding: 5px";
            message.innerHTML = `<span>Found No Results for "${data.query}"</span>`;
            list.prepend(message);
          } else {
            const logoHolder = document.createElement("div");
            const text = document.createElement("span");
            const img = new Image();
            
            logoHolder.style = "padding: 5px; display: flex; align-items: center; justify-content: end; gap: 5px; font-size: 12px;";
            text.textContent = "Powered by";
            img.src = "https://api.mapy.cz/img/api/logo-small.svg";
            img.style = "width: 60px";
            logoHolder.append(text, img);
            list.append(logoHolder);
          }
        },
        noResults: true,
      },
    });
    inputElem.addEventListener("selection", event => {
        const origData = event.detail.selection.value.data;
        const bounds = [[origData.bbox[1],origData.bbox[0]], [origData.bbox[3],origData.bbox[2]]];
        this.map.fitBounds(bounds);
        inputElem.value = origData.name;
    });
  }

  _initBaseLayers() {
    // Check if an API key is available in a data attribute
    const apiKey_thunderforest = document.body.dataset.apikey_thunderforest || "";

    let baseLayers = {};

    // If API key is available, use Thunderforest maps
    if (apiKey_thunderforest) {
      const tileUrl = (style) =>
        `https://{s}.tile.thunderforest.com/${style}/{z}/{x}/{y}{r}.png?apikey=${apiKey_thunderforest}`;
      const tileAttribution =
        "&copy; Thunderforest, &copy; OpenStreetMap contributors";

      const outdoorsLayer = L.tileLayer(tileUrl("outdoors"), {
        attribution: tileAttribution,
        maxZoom: this.config.maxZoom,
      });

      const landscapeLayer = L.tileLayer(tileUrl("landscape"), {
        attribution: tileAttribution,
        maxZoom: this.config.maxZoom,
      });

      const mobileAtlasLayer = L.tileLayer(tileUrl("mobile-atlas"), {
        attribution: tileAttribution,
        maxZoom: this.config.maxZoom,
      });

      baseLayers = {
        Outdoors: outdoorsLayer,
        Landscape: landscapeLayer,
        "Mobile Atlas": mobileAtlasLayer,
      };

      outdoorsLayer.addTo(this.map);
    }
    // Fallback to OSM if no API key
    else {
      const osmLayer = L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
          attribution:
            '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: this.config.maxZoom,
        },
      );

      const satelliteLayer = L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        {
          attribution: "Tiles © Esri",
          maxZoom: this.config.maxZoom,
        },
      );

      baseLayers = {
        Map: osmLayer,
        Satellite: satelliteLayer,
      };

      osmLayer.addTo(this.map);
    }

    L.control.layers(baseLayers).setPosition("topright").addTo(this.map);
    this.map.zoomControl.setPosition("topright");
  }

  _bindMapEvents() {
    this.map.on("click", (e) => this.events.fire("mapClick", e));
  }
}
