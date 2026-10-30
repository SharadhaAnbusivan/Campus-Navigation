
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
  const [loading, setLoading] = useState(false);

  const fromLocation = locations.find(
    (item) => item.id === fromId
  );

  const toLocation = locations.find(
    (item) => item.id === toId
  );

  // Get current GPS location
  function useMyLocation() {
    if (!navigator.geolocation) {
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coordinates = [
          position.coords.latitude,
          position.coords.longitude,
        ];

        setCurrentPosition(coordinates);
        setFromId("current-location");
        setFromSearch("My current location");
      },
      (error) => {
        console.error("Location error:", error);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  }

  // Search and rank campus locations
  function getSuggestions(query) {
    const search = query.trim().toLowerCase();

    if (!search || search === "my current location") {
      return [];
    }

    return locations
      .map((location) => {
        const name = location.name.toLowerCase();
        const words = name.split(/\s+/);

        let score = 0;

        if (name === search) {
          score = 100;
        } else if (name.startsWith(search)) {
          score = 80;
        } else if (
          words.some((word) => word.startsWith(search))
        ) {
          score = 60;
        } else if (name.includes(search)) {
          score = 40;
        } else {
          return null;
        }

        return {
          ...location,
          score,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }

  const startingSuggestions = getSuggestions(fromSearch);
  const destinationSuggestions = getSuggestions(toSearch);

  // Select starting location
  function selectStartingLocation(location) {
    setFromId(location.id);
    setFromSearch(location.name);
  }

  // Select destination
  function selectDestination(location) {
    setToId(location.id);
    setToSearch(location.name);
    setSelectedLocation(location);
  }

  // Find walking route
  async function showWalkingRoute() {
    if (!fromId || !toId) {
      return;
    }

    if (fromId === toId) {
      return;
    }

    const fromCoordinates =
      fromId === "current-location"
        ? currentPosition
        : fromLocation
          ? [
              fromLocation.latitude,
              fromLocation.longitude,
            ]
          : null;

    const toCoordinates = toLocation
      ? [
          toLocation.latitude,
          toLocation.longitude,
        ]
      : null;

    if (!fromCoordinates || !toCoordinates) {
      return;
    }

    setLoading(true);
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
        throw new Error("Routing service unavailable");
      }

      const data = await response.json();

      if (data.error || !data.trip?.legs?.[0]?.shape) {
        throw new Error("No walking route found");
      }

      const leg = data.trip.legs[0];
      const coordinates = decodePolyline(leg.shape);

      setRouteCoordinates(coordinates);

      setRouteInfo({
        distance: leg.summary.length,
        time: leg.summary.time,
      });

      setSelectedLocation(toLocation);
    } catch (error) {
      console.error("Walking route error:", error);
    } finally {
      setLoading(false);
    }
  }

  // Decode Valhalla route polyline
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

      lat += result & 1
        ? ~(result >> 1)
        : result >> 1;

      result = 0;
      shift = 0;

      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);

      lon += result & 1
        ? ~(result >> 1)
        : result >> 1;

      coordinates.push([
        lat / factor,
        lon / factor,
      ]);
    }

    return coordinates;
  }

  // Clear route
  function clearRoute() {
    setRouteCoordinates([]);
    setRouteInfo(null);
  }

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

            {/* FROM INPUT */}
            <label className="route-field">
              From

              <div className="location-input-wrapper">
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

                <button
                  type="button"
                  className="current-location-button"
                  onClick={useMyLocation}
                  title="Use my current location"
                  aria-label="Use my current location"
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="21"
                    height="21"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="3" />
                    <path d="M12 2v3" />
                    <path d="M12 19v3" />
                    <path d="M2 12h3" />
                    <path d="M19 12h3" />
                  </svg>
                </button>
              </div>

              {fromSearch.trim() &&
                !fromId &&
                fromSearch !== "My current location" && (
                  <div className="location-suggestions">
                    {startingSuggestions.map((location) => (
                      <button
                        type="button"
                        key={location.id}
                        onClick={() =>
                          selectStartingLocation(location)
                        }
                      >
                        <span className="suggestion-icon">
                          <svg
                            viewBox="0 0 24 24"
                            width="20"
                            height="20"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" />
                            <circle cx="12" cy="10" r="2.5" />
                          </svg>
                        </span>

                        <span className="suggestion-name">
                          {location.name}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
            </label>

            {/* TO INPUT */}
            <label className="route-field">
              To

              <div className="location-input-wrapper">
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
              </div>

              {toSearch.trim() && !toId && (
                <div className="location-suggestions">
                  {destinationSuggestions.map((location) => (
                    <button
                      type="button"
                      key={location.id}
                      onClick={() =>
                        selectDestination(location)
                      }
                    >
                      <span className="suggestion-icon">
                        <svg
                          viewBox="0 0 24 24"
                          width="20"
                          height="20"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" />
                          <circle cx="12" cy="10" r="2.5" />
                        </svg>
                      </span>

                      <span className="suggestion-name">
                        {location.name}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </label>

            {/* ROUTE BUTTONS */}
            <div className="route-buttons">
              <button
                onClick={showWalkingRoute}
                disabled={loading}
                type="button"
              >
                Show Walking Route
              </button>

              <button
                onClick={clearRoute}
                type="button"
              >
                Clear Route
              </button>
            </div>

          </div>

          {/* MAP */}
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

        {/* LOCATION DETAILS */}
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