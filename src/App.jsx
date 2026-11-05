
import WalkingTracker from "./components/WalkingTracker";
import Leaderboard from "./components/Leaderboard";

import { useState, useEffect, useRef } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";

import { auth } from "./firebase/firebase";
import Login from "./pages/Login";
import CampusMap from "./components/CampusMap";
import locations from "./data/locations.json";
import "./index.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

// TEMPORARY: Expose the current Firebase user for demo testing.
// Available only while running the Vite development server.
if (import.meta.env.DEV) {
  window.__campusTrailGetCurrentUser = () => auth.currentUser;
}

// Save completed walking session to the backend.
async function saveWalkingSession(session) {
  const currentUser = auth.currentUser;

  if (!currentUser) {
    throw new Error("Please log in before saving your walk.");
  }

  if (!session?.requestId || !Array.isArray(session.trail)) {
    throw new Error("Invalid walking session data.");
  }

  const token = await currentUser.getIdToken();

  const response = await fetch(`${API_URL}/walking-sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      requestId: session.requestId,
      trail: session.trail,
    }),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      result.message || "Unable to save walking session."
    );
  }

  return result;
}

export default function App() {
  // Walking tracker state
  const [walkingCoordinates, setWalkingCoordinates] = useState([]);
  const [walkingPosition, setWalkingPosition] = useState(null);

  // Independent live map location state
  const [currentPosition, setCurrentPosition] = useState(null);
  const [isFollowingLocation, setIsFollowingLocation] = useState(false);
  const [locationError, setLocationError] = useState("");
  const locationWatchId = useRef(null);

  // Firebase authentication
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Stop the independent map-location watcher on unmount.
  useEffect(() => {
    return () => {
      if (locationWatchId.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(locationWatchId.current);
      }
    };
  }, []);

  const [selectedLocation, setSelectedLocation] = useState(null);
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [fromSearch, setFromSearch] = useState("");
  const [toSearch, setToSearch] = useState("");

  const [routeCoordinates, setRouteCoordinates] = useState([]);
  const [routeInfo, setRouteInfo] = useState(null);
  const [loading, setLoading] = useState(false);

  if (authLoading) {
    return <div>Loading Campus Trail...</div>;
  }

  if (!user) {
    return <Login />;
  }

  const fromLocation = locations.find((item) => item.id === fromId);
  const toLocation = locations.find((item) => item.id === toId);

  // Start continuous location updates for the map.
  function useMyLocation() {
    if (!navigator.geolocation) {
      setLocationError("Your browser does not support location services.");
      return;
    }

    setLocationError("");
    setFromId("current-location");
    setFromSearch("My current location");
    setIsFollowingLocation(true);

    if (locationWatchId.current !== null) {
      navigator.geolocation.clearWatch(locationWatchId.current);
    }

    locationWatchId.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;

        setCurrentPosition([latitude, longitude]);

        setLocationError(
          accuracy > 50
            ? `Location accuracy is approximately ${Math.round(accuracy)} m.`
            : ""
        );
      },
      (error) => {
        const messages = {
          1: "Location permission denied. Please allow location access.",
          2: "Your location is currently unavailable. Try moving outdoors.",
          3: "Location request timed out. Waiting for another reading.",
        };

        setLocationError(
          messages[error.code] || "Unable to get your location."
        );
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 20000,
      }
    );
  }

  // Stop following on the map.
  function stopFollowingLocation() {
    if (locationWatchId.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(locationWatchId.current);
      locationWatchId.current = null;
    }

    setIsFollowingLocation(false);
  }

  // Search suggestions.
  function getSuggestions(query) {
    const search = query.trim().toLowerCase();

    if (!search || search === "my current location") return [];

    return locations
      .map((location) => {
        const name = location.name.toLowerCase();
        const words = name.split(/\s+/);

        let score = 0;

        if (name === search) score = 100;
        else if (name.startsWith(search)) score = 80;
        else if (words.some((word) => word.startsWith(search))) score = 60;
        else if (name.includes(search)) score = 40;
        else return null;

        return { ...location, score };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }

  const startingSuggestions = getSuggestions(fromSearch);
  const destinationSuggestions = getSuggestions(toSearch);

  function selectStartingLocation(location) {
    stopFollowingLocation();

    setFromId(location.id);
    setFromSearch(location.name);
  }

  function selectDestination(location) {
    setToId(location.id);
    setToSearch(location.name);
    setSelectedLocation(location);
  }

  // Request a pedestrian route from Valhalla.
  async function showWalkingRoute() {
    if (!fromId || !toId) {
      alert(
        "Please select both a starting location and destination from the suggestions."
      );
      return;
    }

    if (fromId === toId) {
      alert("Please choose two different locations.");
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
      alert(
        "Your current location is not available yet, or a location is missing. Please wait for GPS and try again."
      );
      return;
    }

    setLoading(true);
    setRouteCoordinates([]);
    setRouteInfo(null);
    setWalkingCoordinates([]);

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
        throw new Error(
          `Routing service returned HTTP ${response.status}`
        );
      }

      const data = await response.json();

      if (data.error || !data.trip?.legs?.[0]?.shape) {
        throw new Error(data.error || "No walking route found.");
      }

      const leg = data.trip.legs[0];
      const coordinates = decodePolyline(leg.shape);

      if (!coordinates.length) {
        throw new Error("The routing service returned an empty route.");
      }

      setRouteCoordinates(coordinates);

      setRouteInfo({
        distance: leg.summary.length,
        time: leg.summary.time,
      });

      setSelectedLocation(toLocation);
    } catch (error) {
      console.error("Walking route error:", error);
      alert(`Could not find the walking route: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  // Decode Valhalla's encoded polyline.
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

      coordinates.push([
        lat / factor,
        lon / factor,
      ]);
    }

    return coordinates;
  }

  function clearRoute() {
    setRouteCoordinates([]);
    setRouteInfo(null);
    setSelectedLocation(null);
    setWalkingCoordinates([]);
  }

  const mapPosition = currentPosition;

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>Campus Trail</h1>
          <p>Shiv Nadar University Chennai</p>
        </div>

        <div>
          <span className="status">Campus Map</span>

          <button type="button" onClick={() => signOut(auth)}>
            Logout
          </button>
        </div>
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

          {/* Walking tracker */}
          <WalkingTracker
            routeActive={routeCoordinates.length > 0}
            destination={toLocation || null}
            onPositionUpdate={(position) => {
              setWalkingPosition(position);
              setCurrentPosition(position);
            }}
            onTrailUpdate={setWalkingCoordinates}
            onTripCompleted={() => {
              alert("🎉 Location reached! Trip completed!");
            }}
            onSessionFinish={async (session) => {
              console.log("Completed walking session:", session);

              console.log(
                "Distance:",
                session.distanceMeters,
                "metres"
              );

              console.log(
                "Duration:",
                session.durationSeconds,
                "seconds"
              );

              console.log(
                "Completed by arrival:",
                session.completedByArrival
              );

              try {
                const result = await saveWalkingSession(session);

                console.log("Walking session saved:", result);

                alert(
                  `Walk saved successfully!\nDistance: ${result.distanceKm} km`
                );
              } catch (error) {
                console.error("Failed to save walking session:", error);
                alert(`Could not save your walk: ${error.message}`);
              }
            }}
          />

          <div className="route-controls">
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
                    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
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
                        onClick={() => selectStartingLocation(location)}
                      >
                        <span className="suggestion-icon">⌖</span>
                        <span className="suggestion-name">
                          {location.name}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
            </label>

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
                      onClick={() => selectDestination(location)}
                    >
                      <span className="suggestion-icon">⌖</span>
                      <span className="suggestion-name">
                        {location.name}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </label>

            <div className="route-buttons">
              <button
                onClick={showWalkingRoute}
                disabled={loading}
                type="button"
              >
                {loading ? "Finding Route..." : "Show Walking Route"}
              </button>

              <button onClick={clearRoute} type="button">
                Clear Route
              </button>

              {isFollowingLocation && (
                <button
                  onClick={stopFollowingLocation}
                  type="button"
                >
                  Stop following
                </button>
              )}
            </div>

            {locationError && (
              <p className="route-status">{locationError}</p>
            )}
          </div>

          <div className="map-container">
            <CampusMap
              locations={locations}
              selectedLocation={selectedLocation}
              onSelectLocation={setSelectedLocation}
              routeCoordinates={routeCoordinates}
              currentPosition={mapPosition}
              walkingCoordinates={walkingCoordinates}
              followLocation={isFollowingLocation}
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

      {/* Live weekly leaderboard */}
      <Leaderboard />
    </div>
  );
}
