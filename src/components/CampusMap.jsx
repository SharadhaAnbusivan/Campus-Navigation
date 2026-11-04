import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMap,
} from "react-leaflet";

import L from "leaflet";
import { useEffect } from "react";
import "leaflet/dist/leaflet.css";

const destinationIcon = L.divIcon({
  className: "",
  html: '<div class="destination-pin">●</div>',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});

const currentLocationIcon = L.divIcon({
  className: "",
  html: '<div class="current-location-pin"><span></span></div>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

function FitRoute({ routeCoordinates }) {
  const map = useMap();

  useEffect(() => {
    if (routeCoordinates.length > 1) {
      map.fitBounds(routeCoordinates, { padding: [40, 40] });
    }
  }, [map, routeCoordinates]);

  return null;
}

// Optional auto-follow. The marker itself updates whenever currentPosition changes.
function FollowCurrentPosition({ currentPosition, followLocation }) {
  const map = useMap();

  useEffect(() => {
    if (currentPosition && followLocation) {
      map.panTo(currentPosition, { animate: true, duration: 0.5 });
    }
  }, [map, currentPosition, followLocation]);

  return null;
}

export default function CampusMap({
  locations = [],
  selectedLocation,
  routeCoordinates = [],
  currentPosition,
  walkingCoordinates = [],
  onSelectLocation,
  followLocation = false,
}) {
  const center = [12.7515, 80.1950];

  const campusBounds = [
    [12.7420, 80.1830],
    [12.7620, 80.2070],
  ];

  return (
    <MapContainer
      center={center}
      zoom={17}
      minZoom={16}
      maxZoom={20}
      maxBounds={campusBounds}
      maxBoundsViscosity={1}
      scrollWheelZoom
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <FollowCurrentPosition
        currentPosition={currentPosition}
        followLocation={followLocation}
      />

      {locations.map((location) => (
        <Marker
          key={location.id}
          position={[location.latitude, location.longitude]}
          eventHandlers={{
            click: () => onSelectLocation?.(location),
          }}
        >
          <Popup>
            <strong>{location.name}</strong>
            <br />
            {location.category}
          </Popup>
        </Marker>
      ))}

      {selectedLocation && (
        <Marker
          position={[
            selectedLocation.latitude,
            selectedLocation.longitude,
          ]}
          icon={destinationIcon}
        >
          <Popup>
            <strong>{selectedLocation.name}</strong>
            <br />
            Destination
          </Popup>
        </Marker>
      )}

      {currentPosition && (
        <Marker
          position={currentPosition}
          icon={currentLocationIcon}
          zIndexOffset={1000}
        >
          <Popup>You are here</Popup>
        </Marker>
      )}

      {routeCoordinates.length > 0 && (
        <>
          <Polyline
            positions={routeCoordinates}
            pathOptions={{
              color: "#64748b",
              weight: 5,
              opacity: 0.75,
              dashArray: "8 8",
            }}
          />
          <FitRoute routeCoordinates={routeCoordinates} />
        </>
      )}

      {walkingCoordinates.length > 1 && (
        <Polyline
          positions={walkingCoordinates}
          pathOptions={{
            color: "#2563eb",
            weight: 6,
            opacity: 0.98,
            lineCap: "round",
            lineJoin: "round",
          }}
        />
      )}
    </MapContainer>
  );
}
