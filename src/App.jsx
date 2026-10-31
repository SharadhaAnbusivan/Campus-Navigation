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
  const [gettingLocation, setGettingLocation] = useState(false);

  // Live walking states
  const [walkDistance, setWalkDistance] = useState(0);
  const [remainingDistance, setRemainingDistance] = useState(0);
  const [remainingTime, setRemainingTime] = useState(null);
  const [arrivalTime, setArrivalTime] = useState(null);
  const [reachedDestination, setReachedDestination] = useState(false);
  const [trackingError, setTrackingError] = useState("");
  const [completedDuration, setCompletedDuration] = useState(0);
  const [startingWalk, setStartingWalk] = useState(false);

  // Saved walking history
  const [savedWalks, setSavedWalks] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("campusWalks") || "[]");
    } catch {
      return [];
    }
  });

  // GPS and route references
  const watchIdRef = useRef(null);
  const previousPositionRef = useRef(null);
  const distanceRef = useRef(0);
  const startedAtRef = useRef(null);
  const arrivalReadingsRef = useRef(0);

  // Prevent older route requests from overwriting newer routes
  const routeRequestRef = useRef(0);

  const fromLocation = locations.find(
    (item) => item.id === fromId
  );

  const toLocation = locations.find(
    (item) => item.id === toId
  );

  // Calculate distance between two GPS coordinates in metres
  function calculateDistance(lat1, lon1, lat2, lon2) {
    const earthRadius = 6371000;
    const toRadians = (degrees) => (degrees * Math.PI) / 180;

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

  // Format arrival time
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

  // Calculate remaining distance along route
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
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    previousPositionRef.current = null;
    setIsWalking(false);
  }

  // Save a walk
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

    startedAtRef.current = null;
  }

  // Get current GPS location for the From field
  function useMyLocation() {
    if (!navigator.geolocation) {
      setTrackingError(
        "Geolocation is not supported by your browser."
      );
      return;
    }

    if (startingWalk || isWalking || gettingLocation) {
      return;
    }

    setGettingLocation(true);
    setTrackingError("");

    // Invalidate any previous route request
    routeRequestRef.current++;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coordinates = [
          position.coords.latitude,
          position.coords.longitude,
        ];

        console.log("CURRENT GPS LOCATION:", coordinates);

        // Update actual GPS position
        setCurrentPosition(coordinates);

        // Update the From input
        setFromId("current-location");
        setFromSearch("My Current Location");

        setTrackingError("");
        setGettingLocation(false);
      },
      (error) => {
        console.error("Location error:", error);

        let message = "Unable to get your current location.";

        if (error.code === 1) {
          message =
            "Location permission denied. Please allow location access.";
        } else if (error.code === 2) {
          message = "Your current GPS location is unavailable.";
        } else if (error.code === 3) {
          message = "Location request timed out. Please try again.";
        }

        setTrackingError(message);
        setGettingLocation(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 0,
      }
    );
  }

  // Search campus locations
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

        return { ...location, score };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }

  const startingSuggestions = getSuggestions(fromSearch);
  const destinationSuggestions = getSuggestions(toSearch);

  // Select starting location
  function selectStartingLocation(location) {
    routeRequestRef.current++;

    setFromId(location.id);
    setFromSearch(location.name);
    setReachedDestination(false);
    setTrackingError("");
  }

  // Select destination
  function selectDestination(location) {
    routeRequestRef.current++;

    saveWalk("Destination changed");
    stopTracking();

    setStartingWalk(false);
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

  // Get a walking route between any two coordinates
  async function fetchWalkingRoute(fromCoordinates, toCoordinates) {
    console.log("ROUTE START:", fromCoordinates);
    console.log("ROUTE DESTINATION:", toCoordinates);

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

    return {
      coordinates: decodePolyline(leg.shape),
      info: {
        distance: leg.summary.length,
        time: leg.summary.time,
      },
    };
  }

  // Preview route using selected From and To locations
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

    // Assign this request an ID
    const requestId = ++routeRequestRef.current;

    setLoading(true);
    setRouteCoordinates([]);
    setRouteInfo(null);

    try {
      const route = await fetchWalkingRoute(
        fromCoordinates,
        toCoordinates
      );

      // Ignore this result if a newer request has started
      if (requestId !== routeRequestRef.current) {
        return;
      }

      setRouteCoordinates(route.coordinates);
      setRouteInfo(route.info);
      setSelectedLocation(toLocation);
    } catch (error) {
      if (requestId !== routeRequestRef.current) {
        return;
      }

      console.error("Preview route error:", error);

      setTrackingError(
        "Unable to find a walking route. Please try again."
      );
    } finally {
      if (requestId === routeRequestRef.current) {
        setLoading(false);
      }
    }
  }, [
    fromId,
    toId,
    currentPosition,
    fromLocation,
    toLocation,
  ]);

  // Automatically update preview route when locations change
  useEffect(() => {
    if (isWalking || startingWalk || gettingLocation) {
      return;
    }

    if (fromId && toId && fromId !== toId) {
      showWalkingRoute();
    } else {
      routeRequestRef.current++;
      setRouteCoordinates([]);
      setRouteInfo(null);
    }
  }, [
    fromId,
    toId,
    showWalkingRoute,
    isWalking,
    startingWalk,
    gettingLocation,
  ]);

  // Start walking from the ACTUAL current GPS location
  async function startWalking() {
    if (startingWalk || isWalking) {
      return;
    }

    if (!navigator.geolocation) {
      setTrackingError(
        "Your browser does not support GPS tracking."
      );
      return;
    }

    if (!toLocation) {
      setTrackingError("Please select a destination.");
      return;
    }

    if (watchIdRef.current !== null) {
      return;
    }

    // Invalidate all previous route requests
    const requestId = ++routeRequestRef.current;

    // Capture the selected destination for this walk
    const destination = {
      ...toLocation,
    };

    setStartingWalk(true);
    setLoading(true);
    setTrackingError("");

    // Remove the old blue route immediately
    setRouteCoordinates([]);
    setRouteInfo(null);

    try {
      // STEP 1: Get actual current GPS position
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          resolve,
          reject,
          {
            enableHighAccuracy: true,
            timeout: 20000,
            maximumAge: 0,
          }
        );
      });

      if (requestId !== routeRequestRef.current) {
        return;
      }

      const actualStartCoordinates = [
        position.coords.latitude,
        position.coords.longitude,
      ];

      console.log(
        "ACTUAL GPS START:",
        actualStartCoordinates
      );

      console.log(
        "SELECTED FROM (IGNORED FOR WALK):",
        fromLocation
      );

      console.log(
        "SELECTED DESTINATION:",
        destination
      );

      // Update actual GPS position
      setCurrentPosition(actualStartCoordinates);

      // Update the From box to show the actual GPS location
      setFromId("current-location");
      setFromSearch("My Current Location");

      // STEP 2: Get destination coordinates
      const destinationCoordinates = [
        destination.latitude,
        destination.longitude,
      ];

      // STEP 3: Calculate route from ACTUAL GPS to destination
      const activeRoute = await fetchWalkingRoute(
        actualStartCoordinates,
        destinationCoordinates
      );

      if (requestId !== routeRequestRef.current) {
        return;
      }

      const activeRouteCoordinates = activeRoute.coordinates;
      const activeRouteInfo = activeRoute.info;

      if (!activeRouteCoordinates.length) {
        throw new Error("The routing service returned an empty route.");
      }

      console.log(
        "NEW GPS ROUTE COORDINATES:",
        activeRouteCoordinates
      );

      // STEP 4: Replace the old route with the new GPS route
      setRouteCoordinates(activeRouteCoordinates);
      setRouteInfo(activeRouteInfo);
      setSelectedLocation(destination);

      // STEP 5: Reset walking statistics
      setWalkDistance(0);
      setRemainingDistance(activeRouteInfo.distance * 1000);
      setRemainingTime(activeRouteInfo.time / 60);
      setArrivalTime(null);
      setCompletedDuration(0);
      setReachedDestination(false);

      distanceRef.current = 0;

      previousPositionRef.current = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
      };

      arrivalReadingsRef.current = 0;
      startedAtRef.current = Date.now();

      // STEP 6: Start continuous GPS tracking
      setIsWalking(true);

      watchIdRef.current = navigator.geolocation.watchPosition(
        (gpsPosition) => {
          const latitude = gpsPosition.coords.latitude;
          const longitude = gpsPosition.coords.longitude;
          const accuracy = gpsPosition.coords.accuracy;

          const currentCoordinates = [
            latitude,
            longitude,
          ];

          setCurrentPosition(currentCoordinates);

          // Ignore inaccurate GPS readings for calculations
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

          // Calculate remaining distance using the NEW route
          const remaining = getRemainingRouteDistance(
            currentCoordinates,
            activeRouteCoordinates
          );

          if (remaining !== null) {
            setRemainingDistance(remaining);
          }

          // Calculate estimated walking speed
          const elapsedSeconds =
            (Date.now() - startedAtRef.current) / 1000;

          const plannedSpeed =
            (activeRouteInfo.distance * 1000) /
            activeRouteInfo.time;

          const actualSpeed =
            elapsedSeconds > 30 &&
            distanceRef.current > 10
              ? distanceRef.current / elapsedSeconds
              : plannedSpeed;

          const estimatedSpeed = Math.max(
            actualSpeed,
            0.5
          );

          // Calculate remaining time and ETA
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
            destination.latitude,
            destination.longitude
          );

          // Arrival detection
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
          saveWalk("GPS tracking error");
          stopTracking();
        },
        {
          enableHighAccuracy: true,
          maximumAge: 1000,
          timeout: 20000,
        }
      );
    } catch (error) {
      console.error("Unable to start walking:", error);

      if (error.code === 1) {
        setTrackingError(
          "Location permission was denied. Please allow location access."
        );
      } else if (error.code === 2) {
        setTrackingError(
          "Unable to get your current GPS location. Please try again."
        );
      } else if (error.code === 3) {
        setTrackingError(
          "GPS request timed out. Please try again."
        );
      } else {
        setTrackingError(
          error.message ||
          "Unable to calculate a route from your current location."
        );
      }

      startedAtRef.current = null;
      setIsWalking(false);
    } finally {
      if (requestId === routeRequestRef.current) {
        setStartingWalk(false);
        setLoading(false);
      }
    }
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
            <div className="route-field">
              <label htmlFor="from-location-input">
                From
              </label>

              <div className="location-input-wrapper">
                <input
                  id="from-location-input"
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
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    useMyLocation();
                  }}
                  title="Use my current location"
                  aria-label="Use my current location"
                  disabled={
                    gettingLocation ||
                    startingWalk ||
                    isWalking
                  }
                >
                  {gettingLocation ? (
                    "..."
                  ) : (
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
                  )}
                </button>
              </div>

              {fromSearch.trim() &&
                !fromId &&
                fromSearch.toLowerCase() !== "my current location" && (
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
            </div>

            {/* TO INPUT */}
            <div className="route-field">
              <label htmlFor="to-location-input">
                To
              </label>

              <div className="location-input-wrapper">
                <input
                  id="to-location-input"
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
                      onClick={() => selectDestination(location)}
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
            </div>

            {loading && (
              <p className="route-loading">
                {startingWalk
                  ? "Getting your current location and calculating your route..."
                  : "Finding walking route..."}
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
                        disabled={startingWalk || loading}
                      >
                        {startingWalk
                          ? "Calculating route..."
                          : "Start Walking"}
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