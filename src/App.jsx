
import { useState } from "react";
import CampusMap from "./components/CampusMap";
import locations from "./data/locations.json";
import "./index.css";

export default function App() {
  const [selectedLocation, setSelectedLocation] = useState(null);

  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");

  const [fromSearch, setFromSearch] = useState("");
  const [toSearch, setToSearch] = useState("");

  const [currentPosition, setCurrentPosition] = useState(null);
  const [routeCoordinates, setRouteCoordinates] = useState([]);
  const [routeInfo, setRouteInfo] = useState(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const fromLocation = locations.find((item) => item.id === fromId);
  const toLocation = locations.find((item) => item.id === toId);

  function useMyLocation() {
    if (!navigator.geolocation) {
      setStatus("Geolocation is not supported by this browser.");
      return;
    }

    setStatus("Getting your current location...");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coordinates = [
          position.coords.latitude,
          position.coords.longitude,
        ];

        setCurrentPosition(coordinates);
        setFromId("current-location");
        setFromSearch("My current location");
        setStatus("Current location found.");
      },
      (error) => {
        setStatus(
          error.code === 1
            ? "Location permission denied. Allow location access in your browser."
            : "Could not get your location. Try again."
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  }

  function selectStartingLocation(location) {
    setFromId(location.id);
    setFromSearch(location.name);
  }

  function selectDestination(location) {
    setToId(location.id);
    setToSearch(location.name);
    setSelectedLocation(location);
  }

  async function showWalkingRoute() {
    if (!fromId || !toId) {
      setStatus("Choose both a starting point and a destination.");
      return;
    }

    if (fromId === toId) {
      setStatus("Choose two different locations.");
      return;
    }

    const fromCoordinates =
      fromId === "current-location"
        ? currentPosition
        : fromLocation
          ? [fromLocation.latitude, fromLocation.longitude]
          : null;

    const toCoordinates = toLocation
      ? [toLocation.latitude, toLocation.longitude]
      : null;

    if (!fromCoordinates || !toCoordinates) {
      setStatus("Please select valid starting and destination locations.");
      return;
    }

    setLoading(true);
    setStatus("Finding a walking route...");
    setRouteCoordinates([]);
    setRouteInfo(null);

    try {
      const response = await fetch(
        "https://valhalla1.openstreetmap.de/route",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            locations: [
              {
                lat: fromCoordinates[0],
                lon: fromCoordinates[1],
              },
              {
                lat: toCoordinates[0],
                lon: toCoordinates[1],
              },
            ],
            costing: "pedestrian",
            units: "kilometers",
          }),
        }
      );

      if (!response.ok) {
        throw new Error("The routing service is unavailable.");
      }

      const data = await response.json();

      if (data.error || !data.trip?.legs?.[0]?.shape) {
        throw new Error(data.error || "No walking route was found.");
      }

      const leg = data.trip.legs[0];
      const coordinates = decodePolyline(leg.shape);

      setRouteCoordinates(coordinates);
      setRouteInfo({
        distance: leg.summary.length,
        time: leg.summary.time,
      });

      setSelectedLocation(toLocation);
      setStatus("Walking route found.");
    } catch (error) {
      setStatus(
        error.message || "Unable to find a route. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  function decodePolyline(encoded, precision = 6) {
    let index = 0;
    let lat = 0;
    let lon = 0;
    const coordinates = [];
    const factor = 10 ** precision;

    while (index < encoded.length) {
      let result = 0;
      let shift = 0;
      let byte;

      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);

      lat += result & 1 ? ~(result >> 1) : result >> 1;

      result = 0;
      shift = 0;

      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);

      lon += result & 1 ? ~(result >> 1) : result >> 1;

      coordinates.push([lat / factor, lon / factor]);
    }

    return coordinates;
  }

  function clearRoute() {
    setRouteCoordinates([]);
    setRouteInfo(null);
    setStatus("");
  }

  const startingSuggestions = fromSearch.trim()
    ? locations.filter((location) =>
        location.name.toLowerCase().includes(fromSearch.trim().toLowerCase())
      )
    : [];

  const destinationSuggestions = toSearch.trim()
    ? locations.filter((location) =>
        location.name.toLowerCase().includes(toSearch.trim().toLowerCase())
      )
    : [];

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>Campus Navigator</h1>
          <p>Shiv Nadar University Chennai</p>
        </div>

        <span className="status">Campus Map</span>
      </header>

      <main className="main-content">
        <section className="map-section">
          <div className="section-heading">
            <div>
              <h2>Explore Campus</h2>
              <p>Select a marker or plan a walking route.</p>
            </div>

            <span>{locations.length} locations</span>
          </div>

          <div className="route-controls">
            <label className="route-field">
              From

              <input
                type="text"
                placeholder="Type starting location..."
                value={fromSearch}
                autoComplete="off"
                onChange={(event) => {
                  setFromSearch(event.target.value);
                  setFromId("");
                }}
              />

              {fromSearch.trim() && !fromId && (
                <div className="location-suggestions">
                  {startingSuggestions.length > 0 ? (
                    startingSuggestions.map((location) => (
                      <button
                        type="button"
                        key={location.id}
                        onClick={() => selectStartingLocation(location)}
                      >
                        {location.name}
                      </button>
                    ))
                  ) : (
                    <p className="no-suggestions">
                      No campus locations found.
                    </p>
                  )}
                </div>
              )}
            </label>

            <label className="route-field">
              To

              <input
                type="text"
                placeholder="Type destination..."
                value={toSearch}
                autoComplete="off"
                onChange={(event) => {
                  setToSearch(event.target.value);
                  setToId("");
                  setSelectedLocation(null);
                  setRouteCoordinates([]);
                  setRouteInfo(null);
                }}
              />

              {toSearch.trim() && !toId && (
                <div className="location-suggestions">
                  {destinationSuggestions.length > 0 ? (
                    destinationSuggestions.map((location) => (
                      <button
                        type="button"
                        key={location.id}
                        onClick={() => selectDestination(location)}
                      >
                        {location.name}
                      </button>
                    ))
                  ) : (
                    <p className="no-suggestions">
                      No campus locations found.
                    </p>
                  )}
                </div>
              )}
            </label>

            <div className="route-buttons">
              <button
                onClick={showWalkingRoute}
                disabled={loading}
                type="button"
              >
                {loading ? "Finding route..." : "Show Walking Route"}
              </button>

              <button onClick={clearRoute} type="button">
                Clear Route
              </button>
            </div>

            {status && (
              <p className="route-status" role="status">
                {status}
              </p>
            )}
          </div>

          <div className="map-container">
            <CampusMap
              locations={locations}
              selectedLocation={selectedLocation}
              onSelectLocation={setSelectedLocation}
              routeCoordinates={routeCoordinates}
              currentPosition={currentPosition}
            />
          </div>
        </section>

        <aside className="details-panel">
          <h2>Location Details</h2>

          {selectedLocation ? (
            <>
              <span className="category">
                {selectedLocation.category}
              </span>

              <h3>{selectedLocation.name}</h3>

              <p>{selectedLocation.description}</p>

              {routeInfo && (
                <div className="route-summary">
                  <p>
                    <strong>Distance</strong>
                    <br />
                    {routeInfo.distance.toFixed(2)} km
                  </p>

                  <p>
                    <strong>Estimated walking time</strong>
                    <br />
                    {Math.ceil(routeInfo.time / 60)} min
                  </p>
                </div>
              )}

              <div className="coordinates">
                <p>
                  <strong>Latitude:</strong>{" "}
                  {selectedLocation.latitude}
                </p>

                <p>
                  <strong>Longitude:</strong>{" "}
                  {selectedLocation.longitude}
                </p>
              </div>
            </>
          ) : (
            <div className="empty-state">
              <span className="empty-icon">⌖</span>
              <p>Select a campus marker to see its details.</p>
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}
