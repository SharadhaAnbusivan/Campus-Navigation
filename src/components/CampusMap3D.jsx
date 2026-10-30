import { useEffect, useRef } from "react";
import {
  Map,
  Marker,
  NavigationControl,
  Popup,
  setWorkerUrl,
} from "maplibre-gl";

import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";

setWorkerUrl(workerUrl);

export default function CampusMap3D({
  locations = [],
  selectedLocation,
  onSelectLocation,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const selectedRef = useRef(selectedLocation);
  const onSelectRef = useRef(onSelectLocation);

  useEffect(() => {
    selectedRef.current = selectedLocation;
    onSelectRef.current = onSelectLocation;
  }, [selectedLocation, onSelectLocation]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new Map({
      container: containerRef.current,
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: [80.195, 12.7515],
      zoom: 16,
      pitch: 55,
      bearing: -15,
      antialias: true,
    });

    mapRef.current = map;
    map.addControl(new NavigationControl({ visualizePitch: true }), "top-right");

    map.on("load", () => {
      const style = map.getStyle();
      const buildingLayer = style.layers.find(
        (layer) => layer["source-layer"] === "building"
      );

      if (buildingLayer && style.sources[buildingLayer.source]) {
        const sourceId = buildingLayer.source;

        if (!map.getLayer("campus-3d-buildings")) {
          map.addLayer({
            id: "campus-3d-buildings",
            source: sourceId,
            "source-layer": buildingLayer["source-layer"],
            filter: ["!=", ["get", "hide_3d"], true],
            type: "fill-extrusion",
            minzoom: 14,
            paint: {
              "fill-extrusion-color": "#c7d2de",
              "fill-extrusion-height": [
                "interpolate",
                ["linear"],
                ["zoom"],
                14, 0,
                15, ["coalesce", ["get", "render_height"], ["get", "height"], 8],
              ],
              "fill-extrusion-base": [
                "coalesce",
                ["get", "render_min_height"],
                ["get", "min_height"],
                0,
              ],
              "fill-extrusion-opacity": 0.9,
            },
          });
        }
      }
    });

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((marker) => marker.remove());

    markersRef.current = locations.map((location) => {
      const element = document.createElement("button");
      element.className = "campus-map-marker";
      element.type = "button";
      element.title = location.name;
      element.setAttribute("aria-label", location.name);
      element.textContent = "●";

      if (selectedLocation?.id === location.id) {
        element.classList.add("selected");
      }

      element.addEventListener("click", () => {
        onSelectRef.current?.(location);
        map.flyTo({
          center: [location.longitude, location.latitude],
          zoom: 18,
          pitch: 60,
          duration: 1000,
        });
      });

      const popup = new Popup({ offset: 16 }).setHTML(
        `<strong>${String(location.name)
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")}</strong>`
      );

      return new Marker({ element })
        .setLngLat([location.longitude, location.latitude])
        .setPopup(popup)
        .addTo(map);
    });
  }, [locations, selectedLocation]);

  function setView(is3D) {
    mapRef.current?.easeTo({
      pitch: is3D ? 55 : 0,
      bearing: is3D ? -15 : 0,
      duration: 800,
    });
  }

  function locateMe() {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by this browser.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        mapRef.current?.flyTo({
          center: [coords.longitude, coords.latitude],
          zoom: 19,
          pitch: 60,
          duration: 1200,
        });
      },
      () => alert("Location unavailable. Check your browser's location permission."),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  return (
    <div className="campus-map-3d">
      <div ref={containerRef} className="campus-map-3d-canvas" />

      <div className="campus-map-3d-controls">
        <button type="button" onClick={() => setView(true)}>3D View</button>
        <button type="button" onClick={() => setView(false)}>2D View</button>
        <button type="button" onClick={locateMe}>Locate Me</button>
      </div>
    </div>
  );
}