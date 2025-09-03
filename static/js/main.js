import { createWormhole, cancelWormhole } from "./modules/api.js";
import { UI } from "./modules/ui.js";
import { MapManager } from "./modules/map.js";

class PathDrawerApp {
  constructor() {
    this.state = {
      points: [],
      isProcessing: false,
      isDragging: false,
      lastDragEndTime: 0,
      activeTransferId: null,
    };

    this.ui = new UI();
    this.map = new MapManager("map");

    this.init();
  }

  init() {
    this.bindEventListeners();
    this.setupDragAndDrop();
    this.updateUI();
  }

  bindEventListeners() {
    // Button handlers
    document
      .getElementById("clear-btn")
      .addEventListener("click", () => this.clearAll());
    document
      .getElementById("export-gpx-btn")
      .addEventListener("click", () => this.exportPathToGPX());
    document
      .getElementById("export-wormhole-btn")
      .addEventListener("click", () => this.sharePathViaWormhole());
    document
      .getElementById("import-gpx-btn")
      .addEventListener("click", () =>
        document.getElementById("gpx-input").click(),
      );
    document
      .getElementById("gpx-input")
      .addEventListener("change", (e) => this.handleGpxImport(e));

    document
      .getElementById("replan-btn")
      .addEventListener("click", () => this.replanPath());

    // Export dropdown
    document.getElementById("export-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      document.querySelector(".export-options").classList.toggle("show");
    });

    document.addEventListener("click", () =>
      document.querySelector(".export-options").classList.remove("show"),
    );

    // Map events
    this.map.on("mapClick", (e) => this.handleMapClick(e.latlng));
    this.map.on("markerDragStart", (data) => this.handleMarkerDragStart());
    this.map.on("markerDragEnd", (data) => this.handleMarkerDragEnd(data));
    this.map.on("markerRightClick", (data) =>
      this.handleMarkerRightClick(data),
    );
    this.map.on("gpxPointsLoaded", (data) => this.handleGpxPoints(data.coords));
    this.map.on("gpxLoadError", (data) =>
      this.ui.showStatus(`Error loading GPX: ${data.error}`, "error"),
    );
    this.map.on("lineClick", (data) => 
      this.handleLineClick(data)
    );
  }

  setupDragAndDrop() {
    const dropzone = document.getElementById("dropzone");

    // Prevent default drag behaviors
    ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
      document.body.addEventListener(eventName, preventDefaults, false);
    });

    // Show dropzone when file is dragged over
    ["dragenter", "dragover"].forEach((eventName) => {
      document.body.addEventListener(
        eventName,
        () => {
          dropzone.classList.add("active");
        },
        false,
      );
    });

    // Hide dropzone when file is dragged out or dropped
    document.body.addEventListener(
      "dragleave",
      (e) => {
        // Only hide if leaving the body
        if (!e.relatedTarget || e.relatedTarget.nodeName === "HTML") {
          dropzone.classList.remove("active");
        }
      },
      false,
    );

    document.body.addEventListener(
      "drop",
      () => {
        dropzone.classList.remove("active");
      },
      false,
    );

    // Handle dropped files
    dropzone.addEventListener(
      "drop",
      (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;

        if (files.length && files[0].name.toLowerCase().endsWith(".gpx")) {
          this.handleGpxFile(files[0]);
        } else {
          this.ui.showStatus("Please drop a GPX file.", "error");
        }
      },
      false,
    );

    function preventDefaults(e) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  handleGpxFile(file) {
    this.ui.showStatus(`Importing ${file.name}...`, "info");

    const reader = new FileReader();
    reader.onload = (e) => this.map.displayGpxTrack(e.target.result);
    reader.onerror = () =>
      this.ui.showStatus(`Error reading file: ${reader.error}`, "error");
    reader.readAsText(file);
  }

  redrawEverything() {
    this.map.clearAllMarkers();
    this.map.clearPath();

    // Create markers
    this.state.points.forEach((point, index) => {
      point.leafletMarker = this.map.createMarker(
        point.lat,
        point.lng,
        index,
        this.state.points.length,
      );
    });

    // Draw path if at least 2 points
    if (this.state.points.length > 1) {
      this.state.points.forEach((point,index) => {
        if (index + 1 < this.state.points.length){
          const nextPoint = this.state.points[index + 1];
          const coords = [[point.lat, point.lng],[nextPoint.lat, nextPoint.lng]];
          this.map.drawPath(coords);
        }
      });
    }

    this.updateUI();
  }

  updateUI() {
    this.ui.updatePointCount(this.state.points.length);
    this.ui.setExportButtonState(this.state.points.length > 1);
    this.ui.setProcessingState(this.state.isProcessing);
  }

  handleMarkerDragStart() {
    this.state.isDragging = true;
    this.map.toggleMapInteraction(false);
  }

  handleMarkerDragEnd({ marker }) {
    this.state.isDragging = false;
    this.state.lastDragEndTime = Date.now();
    this.map.toggleMapInteraction(true);

    const point = this.state.points.find((p) => p.leafletMarker === marker);
    if (!point) return;

    // Update coordinate in state
    const newLatLng = marker.getLatLng();
    point.lat = newLatLng.lat;
    point.lng = newLatLng.lng;

    // Redraw path if needed
    if (this.state.points.length > 1) {
      this.map.clearPath();
      this.state.points.forEach((point,index) => {
        if (index + 1 < this.state.points.length){
          const nextPoint = this.state.points[index + 1];
          const coords = [[point.lat, point.lng],[nextPoint.lat, nextPoint.lng]];
          this.map.drawPath(coords);
        }
      });
   }
  }

  handleMapClick(latlng) {
    if (
      this.state.isProcessing ||
      this.state.isDragging ||
      Date.now() - this.state.lastDragEndTime < 200
    ) {
      return;
    }

    this.state.points.push({ lat: latlng.lat, lng: latlng.lng });
    this.ui.showStatus("Point added.", "success", 1000);
    this.redrawEverything();
  }

  handleLineClick({ polyline, latlng }){
    const coords = polyline.getLatLngs();
    const index = this.state.points.findIndex(element => element.lat === coords[0].lat && element.lng === coords[0].lng);
    this.state.points.splice(index + 1, 0, {lat: latlng.lat, lng: latlng.lng});
    this.redrawEverything();
  }

  handleMarkerRightClick({ marker }) {
    const point = this.state.points.find((p) => p.leafletMarker === marker);
    if (!point) return;

    const content = this.ui.showContextMenu({
      ondelete: () => {
        this.map.closeAllPopups();
        this.deletePoint(point);
      },
      oncopy: async () => {
        this.map.closeAllPopups();
        const coords = `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}`;
        await navigator.clipboard.writeText(coords);
        this.ui.showStatus("Coordinates copied to clipboard.", "success");
      },
    });

    this.map.showPopup(marker.getLatLng(), content);
  }

  deletePoint(pointToDelete) {
    const index = this.state.points.indexOf(pointToDelete);
    if (index > -1) {
      this.state.points.splice(index, 1);
      this.ui.showStatus("Point deleted.", "info", 1000);
      this.redrawEverything();
    }
  }

  handleGpxPoints(coords) {
    if (!coords || coords.length === 0) {
      this.ui.showStatus("No points found in the GPX file.", "info");
      return;
    }

    this.clearAll();
    this.state.points = coords.map((c) => ({ lat: c.lat, lng: c.lng }));
    this.ui.showStatus(
      `Imported ${coords.length} points from GPX file.`,
      "success",
    );
    this.redrawEverything();
  }

  handleGpxImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    this.handleGpxFile(file);
    event.target.value = "";
  }

  clearAll() {
    if (this.state.isProcessing) return;
    this.state.points = [];
    this.redrawEverything();
    this.ui.showStatus("All points cleared.", "info");
  }

  exportPathToGPX() {
    if (this.state.points.length < 2) {
      this.ui.showStatus(
        "Path must have at least 2 points to export.",
        "error",
      );
      return;
    }

    const gpxData = this._generateGPX();
    this._downloadFile(gpxData, "path.gpx", "application/gpx+xml");
    this.ui.showStatus("GPX file exported.", "success");
  }

  replanPath(){
    
  }

  async sharePathViaWormhole() {
    if (this.state.points.length < 2) {
      this.ui.showStatus("Path must have at least 2 points to share.", "error");
      return;
    }

    this.setProcessingState(true);
    const gpxData = this._generateGPX();
    const progressDialog = this.ui.showProgressDialog("Creating Wormhole...");

    try {
      const data = await createWormhole(gpxData);
      if (data.success) {
        this.state.activeTransferId = data.transfer_id;
        this.ui.showWormholeDialog({
          code: data.code,
          oncancel: () => this.cancelWormholeTransfer(),
        });
      } else {
        this.ui.showErrorDialog({
          title: "Wormhole Failed",
          message: data.message,
        });
      }
    } catch (error) {
      this.ui.showErrorDialog({
        title: "Wormhole Error",
        message: error.message,
      });
    } finally {
      progressDialog.close();
      this.setProcessingState(false);
    }
  }

  async cancelWormholeTransfer() {
    if (!this.state.activeTransferId) return;

    try {
      await cancelWormhole(this.state.activeTransferId);
      this.ui.showStatus("Wormhole transfer cancelled.", "info");
    } catch (error) {
      this.ui.showStatus("Failed to cancel transfer.", "error");
    } finally {
      this.state.activeTransferId = null;
    }
  }

  setProcessingState(isProcessing) {
    this.state.isProcessing = isProcessing;
    this.updateUI();
  }

  _generateGPX() {
    const trackPoints = this.state.points
      .map((p) => `<wpt lat="${p.lat}" lon="${p.lng}"></wpt>`)
      .join("\n");

    return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="PathDrawerApp">${trackPoints}</gpx>`;
  }

  _downloadFile(data, filename, type) {
    const blob = new Blob([data], { type });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  new PathDrawerApp();
});
