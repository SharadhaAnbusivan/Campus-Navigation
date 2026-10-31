
import { useState, useEffect, useCallback, useRef } from "react";
import CampusMap from "./components/CampusMap";
import locations from "./data/locations.json";
import "./index.css";

export default function App() {
  const [isWalking, setIsWalking] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(null);

  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");

  const [fromSearch, setFromSearch] = useState("");
  const [toSearch, setToSearch] = useState("");

  const [currentPosition, setCurrentPosition] = useState(null);
  const [routeCoordinates, setRouteCoordinates] = useState([]);
  const [routeInfo, setRouteInfo] = useState(null);
  const [loading, setLoading] = useState(false);

  // Live walking states
  const [walkDistance, setWalkDistance] = useState(0);
  const [remainingDistance, setRemainingDistance] = useState(0);
  const [remainingTime, setRemainingTime] = useState(null);
  const [arrivalTime, setArrivalTime] = useState(null);
  const [reachedDestination, setReachedDestination] = useState(false);
  const [trackingError, setTrackingError] = useState("");
  const [completedDuration, setCompletedDuration] = useState(0);

  // Saved walking history
  const [savedWalks, setSavedWalks] = useState(() => {
    try {
      return JSON.parse(
        localStorage.getItem("campusWalks") || "[]"
      );
    } catch {
      return [];
    }
  });

  // GPS references
  const watchIdRef = useRef(null);
  const previousPositionRef = useRef(null);
  const distanceRef = useRef(0);
  const startedAtRef = useRef(null);
  const arrivalReadingsRef = useRef(0);

  const fromLocation = locations.find(
    (item) => item.id === fromId
  );

  const toLocation = locations.find(
    (item) => item.id === toId
  );

  // Calculate distance between two GPS coordinates in metres
  function calculateDistance(lat1, lon1, lat2, lon2) {
    const earthRadius = 6371000;

    const toRadians = (degrees) =>
      (degrees * Math.PI) / 180;

    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRadians(lat1)) *
        Math.cos(toRadians(lat2)) *
        Math.sin(dLon / 2) ** 2;

    return (
      earthRadius *
      2 *
      Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    );
  }

  // Format an arrival timestamp as a clock time
  function formatArrivalTime(minutes) {
    if (minutes === null || minutes === undefined) {
      return "Calculating...";
    }

    const arrival = new Date(
      Date.now() + minutes * 60 * 1000
    );

    return arrival.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  // Calculate remaining distance along the planned route
  function getRemainingRouteDistance(position, coordinates) {
    if (!coordinates || coordinates.length === 0) {
      return null;
    }

    let nearestIndex = 0;
    let nearestDistance = Infinity;

    coordinates.forEach((coordinate, index) => {
      const distance = calculateDistance(
        position[0],
        position[1],
        coordinate[0],
        coordinate[1]
      );

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });

    let totalRemaining = nearestDistance;

    for (
      let i = nearestIndex;
      i < coordinates.length - 1;
      i++
    ) {
      totalRemaining += calculateDistance(
        coordinates[i][0],
        coordinates[i][1],
        coordinates[i + 1][0],
        coordinates[i + 1][1]
      );
    }

    return totalRemaining;
  }

  // Stop GPS tracking
  function stopTracking() {
    if (
      watchIdRef.current !== null &&
      navigator.geolocation
    ) {
      navigator.geolocation.clearWatch(
        watchIdRef.current
      );

      watchIdRef.current = null;
    }

    previousPositionRef.current = null;
    setIsWalking(false);
  }

  // Save a walk to browser localStorage
  function saveWalk(reason) {
    if (!startedAtRef.current) {
      return;
    }

    const endedAt = Date.now();

    const duration = Math.floor(
      (endedAt - startedAtRef.current) / 1000
    );

    const walk = {
      id: endedAt,
      destination: toLocation?.name || "Unknown",
      distance: Number(
        (distanceRef.current / 1000).toFixed(3)
      ),
      duration,
      startedAt: startedAtRef.current,
      endedAt,
      reason,
    };

    try {
      const existingWalks = JSON.parse(
        localStorage.getItem("campusWalks") || "[]"
      );

      const updatedWalks = [...existingWalks, walk];

      localStorage.setItem(
        "campusWalks",
        JSON.stringify(updatedWalks)
      );

      setSavedWalks(updatedWalks);
      setCompletedDuration(duration);

      console.log("Walk saved:", walk);
    } catch (error) {
      console.error("Unable to save walk:", error);
    }

    // Prevent duplicate saves
    startedAtRef.current = null;
  }

  // Get current GPS location
  function useMyLocation() {
    if (!navigator.geolocation) {
      setTrackingError(
        "Geolocation is not supported by your browser."
      );
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
        setTrackingError("");
      },
      (error) => {
        console.error("Location error:", error);

        setTrackingError(
          "Unable to get your current location."
        );
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
    setReachedDestination(false);
    setTrackingError("");
  }

  // Select destination
  function selectDestination(location) {
    // Save an active walk before changing destination
    saveWalk("Destination changed");
    stopTracking();

    setReachedDestination(false);
    setWalkDistance(0);
    setRemainingDistance(0);
    setRemainingTime(null);
    setArrivalTime(null);
    setCompletedDuration(0);
    setTrackingError("");

    distanceRef.current = 0;
    previousPositionRef.current = null;
    arrivalReadingsRef.current = 0;

    setToId(location.id);
    setToSearch(location.name);
    setSelectedLocation(location);
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

  // Find walking route automatically
  const showWalkingRoute = useCallback(async () => {
    if (!fromId || !toId || fromId === toId) {
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

      setTrackingError(
        "Unable to find a walking route. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }, [
    fromId,
    toId,
    currentPosition,
    fromLocation,
    toLocation,
  ]);

  // Automatically update route when locations change
  useEffect(() => {
    if (isWalking) {
      return;
    }

    if (fromId && toId && fromId !== toId) {
      showWalkingRoute();
    } else {
      setRouteCoordinates([]);
      setRouteInfo(null);
    }
  }, [fromId, toId, showWalkingRoute, isWalking]);

  // Start real GPS tracking
  function startWalking() {
    if (!navigator.geolocation) {
      setTrackingError(
        "Your browser does not support GPS tracking."
      );
      return;
    }

    if (!toLocation || !routeInfo) {
      setTrackingError(
        "Please select a destination and wait for the route."
      );
      return;
    }

    if (watchIdRef.current !== null) {
      return;
    }

    setTrackingError("");
    setReachedDestination(false);
    setWalkDistance(0);
    setRemainingDistance(routeInfo.distance * 1000);
    setRemainingTime(routeInfo.time / 60);
    setArrivalTime(null);
    setCompletedDuration(0);

    distanceRef.current = 0;
    previousPositionRef.current = null;
    arrivalReadingsRef.current = 0;

    startedAtRef.current = Date.now();

    setIsWalking(true);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        const accuracy = position.coords.accuracy;

        const currentCoordinates = [
          latitude,
          longitude,
        ];

        // Update live map position
        setCurrentPosition(currentCoordinates);

        // Ignore inaccurate GPS readings
        if (accuracy > 20) {
          arrivalReadingsRef.current = 0;
          return;
        }

        const previous = previousPositionRef.current;

        if (previous) {
          const movedDistance = calculateDistance(
            previous.latitude,
            previous.longitude,
            latitude,
            longitude
          );

          // Ignore GPS fluctuations and unusually large jumps
          if (
            movedDistance >= 2 &&
            movedDistance <= 100
          ) {
            distanceRef.current += movedDistance;
            setWalkDistance(distanceRef.current);
          }
        }

        previousPositionRef.current = {
          latitude,
          longitude,
          accuracy,
        };

        // Calculate remaining distance along planned route
        const remaining = getRemainingRouteDistance(
          currentCoordinates,
          routeCoordinates
        );

        if (remaining !== null) {
          setRemainingDistance(remaining);
        }

        // Calculate estimated walking speed
        const elapsedSeconds =
          (Date.now() - startedAtRef.current) / 1000;

        const plannedSpeed =
          (routeInfo.distance * 1000) /
          routeInfo.time;

        const actualSpeed =
          elapsedSeconds > 30 &&
          distanceRef.current > 10
            ? distanceRef.current / elapsedSeconds
            : plannedSpeed;

        const estimatedSpeed = Math.max(
          actualSpeed,
          0.5
        );

        // Calculate remaining time
        const minutesRemaining =
          remaining !== null
            ? remaining / estimatedSpeed / 60
            : 0;

        setRemainingTime(minutesRemaining);
        setArrivalTime(Math.ceil(minutesRemaining));

        // Check distance from actual destination
        const distanceToDestination = calculateDistance(
          latitude,
          longitude,
          toLocation.latitude,
          toLocation.longitude
        );

        // Require 3 consecutive accurate readings within 10 metres
        if (distanceToDestination <= 10) {
          arrivalReadingsRef.current += 1;
        } else {
          arrivalReadingsRef.current = 0;
        }

        if (arrivalReadingsRef.current >= 3) {
          saveWalk("Reached destination");

          setReachedDestination(true);
          setArrivalTime(0);
          setRemainingTime(0);
          setRemainingDistance(0);

          stopTracking();
        }
      },
      (error) => {
        console.error("GPS tracking error:", error);

        let message = "GPS tracking stopped.";

        if (error.code === 1) {
          message =
            "Location permission was denied. Please allow location access.";
        } else if (error.code === 2) {
          message =
            "Your current GPS location is unavailable.";
        } else if (error.code === 3) {
          message = "GPS location request timed out.";
        }

        setTrackingError(message);
        stopTracking();
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 20000,
      }
    );
  }

  // End the current walk and save it
  function cancelWalking() {
    saveWalk("Ended early");

    stopTracking();

    setWalkDistance(0);
    setRemainingDistance(0);
    setRemainingTime(null);
    setArrivalTime(null);
    setReachedDestination(false);
    setTrackingError("");

    distanceRef.current = 0;
    previousPositionRef.current = null;
    arrivalReadingsRef.current = 0;
  }

  // Clean up GPS tracking when leaving the page
  useEffect(() => {
    return () => {
      if (
        watchIdRef.current !== null &&
        navigator.geolocation
      ) {
        navigator.geolocation.clearWatch(
          watchIdRef.current
        );
      }
    };
  }, []);

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
            </div>
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
                    if (isWalking) {
                      cancelWalking();
                    }

                    setFromSearch(event.target.value);
                    setFromId("");
                    setTrackingError("");
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
                    if (isWalking) {
                      cancelWalking();
                    }

                    setToSearch(event.target.value);
                    setToId("");
                    setSelectedLocation(null);
                    setRouteCoordinates([]);
                    setRouteInfo(null);
                    setTrackingError("");
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

            {loading && (
              <p className="route-loading">
                Finding walking route...
              </p>
            )}

            {trackingError && (
              <p className="route-status">
                {trackingError}
              </p>
            )}
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
                  {isWalking ? (
                    <>
                      <p>
                        <strong>Total distance walked</strong>
                        <br />
                        {(walkDistance / 1000).toFixed(2)} km
                      </p>

                      <p>
                        <strong>Remaining distance</strong>
                        <br />
                        {(remainingDistance / 1000).toFixed(2)} km
                      </p>

                      <p>
                        <strong>Remaining time</strong>
                        <br />
                        {remainingTime === null
                          ? "Calculating..."
                          : `${Math.ceil(remainingTime)} minutes`}
                      </p>

                      <p>
                        <strong>Estimated arrival time</strong>
                        <br />
                        {formatArrivalTime(remainingTime)}
                      </p>

                      <button
                        type="button"
                        className="cancel-walking-button"
                        onClick={cancelWalking}
                      >
                        End Walk & Save
                      </button>
                    </>
                  ) : reachedDestination ? (
                    <div className="arrival-message">
                      <strong>
                        You've reached your destination!
                      </strong>

                      <p>Your GPS tracking has ended.</p>

                      <p>
                        Total distance walked:{" "}
                        {(walkDistance / 1000).toFixed(2)} km
                      </p>

                      <p>
                        Total duration:{" "}
                        {Math.floor(completedDuration / 60)} min
                      </p>
                    </div>
                  ) : (
                    <>
                      <p>
                        <strong>Total route distance</strong>
                        <br />
                        {routeInfo.distance.toFixed(2)} km
                      </p>

                      <p>
                        <strong>Estimated walking duration</strong>
                        <br />
                        {Math.ceil(routeInfo.time / 60)} minutes
                      </p>

                      <p>
                        <strong>Estimated arrival time</strong>
                        <br />
                        {formatArrivalTime(routeInfo.time / 60)}
                      </p>

                      <button
                        type="button"
                        className="start-walking-button"
                        onClick={startWalking}
                      >
                        Start Walking
                      </button>
                    </>
                  )}
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
              <p>
                Select a campus marker to see its details.
              </p>
            </div>
          )}

          {/* Saved walk count */}
          <div className="saved-walk-count">
            <p>
              <strong>Saved walks:</strong> {savedWalks.length}
            </p>
          </div>
        </aside>
      </main>
    </div>
  );
}