
import {
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";

import locations from "../data/locations.json";

// Calculate distance between GPS coordinates in metres
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

export default function useCampusNavigation() {
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
  const [startingWalk, setStartingWalk] = useState(false);

  const [walkDistance, setWalkDistance] = useState(0);
  const [remainingDistance, setRemainingDistance] = useState(0);
  const [remainingTime, setRemainingTime] = useState(null);
  const [arrivalTime, setArrivalTime] = useState(null);
  const [reachedDestination, setReachedDestination] = useState(false);
  const [trackingError, setTrackingError] = useState("");
  const [completedDuration, setCompletedDuration] = useState(0);

  const [savedWalks, setSavedWalks] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("campusWalks") || "[]");
    } catch {
      return [];
    }
  });

  const watchIdRef = useRef(null);
  const previousPositionRef = useRef(null);
  const distanceRef = useRef(0);
  const startedAtRef = useRef(null);
  const arrivalReadingsRef = useRef(0);
  const routeRequestRef = useRef(0);

  const fromLocation = locations.find(
    (item) => item.id === fromId
  );

  const toLocation = locations.find(
    (item) => item.id === toId
  );

  function formatArrivalTime(minutes) {
    if (minutes === null || minutes === undefined) {
      return "Calculating...";
    }

    const arrival = new Date(Date.now() + minutes * 60 * 1000);

    return arrival.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

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

    for (let i = nearestIndex; i < coordinates.length - 1; i++) {
      totalRemaining += calculateDistance(
        coordinates[i][0],
        coordinates[i][1],
        coordinates[i + 1][0],
        coordinates[i + 1][1]
      );
    }

    return totalRemaining;
  }

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

  function saveWalk(reason) {
    if (!startedAtRef.current) return;

    const endedAt = Date.now();

    const duration = Math.floor(
      (endedAt - startedAtRef.current) / 1000
    );

    const walk = {
      id: endedAt,
      destination: toLocation?.name || "Unknown",
      distance: Number((distanceRef.current / 1000).toFixed(3)),
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
    } catch (error) {
      console.error("Unable to save walk:", error);
    }

    startedAtRef.current = null;
  }

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
    routeRequestRef.current++;

    setFromId(location.id);
    setFromSearch(location.name);
    setReachedDestination(false);
    setTrackingError("");
  }

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

  function useMyLocation() {
    if (!navigator.geolocation) {
      setTrackingError("Geolocation is not supported by your browser.");
      return;
    }

    if (startingWalk || isWalking || gettingLocation) return;

    setGettingLocation(true);
    setTrackingError("");
    routeRequestRef.current++;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coordinates = [
          position.coords.latitude,
          position.coords.longitude,
        ];

        setCurrentPosition(coordinates);
        setFromId("current-location");
        setFromSearch("My Current Location");
        setGettingLocation(false);
      },
      (error) => {
        let message = "Unable to get your current location.";

        if (error.code === 1) {
          message = "Location permission denied. Please allow location access.";
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

  async function fetchWalkingRoute(fromCoordinates, toCoordinates) {
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

  const showWalkingRoute = useCallback(async () => {
    if (!fromId || !toId || fromId === toId) return;

    const fromCoordinates =
      fromId === "current-location"
        ? currentPosition
        : fromLocation
          ? [fromLocation.latitude, fromLocation.longitude]
          : null;

    const toCoordinates = toLocation
      ? [toLocation.latitude, toLocation.longitude]
      : null;

    if (!fromCoordinates || !toCoordinates) return;

    const requestId = ++routeRequestRef.current;

    setLoading(true);
    setRouteCoordinates([]);
    setRouteInfo(null);

    try {
      const route = await fetchWalkingRoute(
        fromCoordinates,
        toCoordinates
      );

      if (requestId !== routeRequestRef.current) return;

      setRouteCoordinates(route.coordinates);
      setRouteInfo(route.info);
      setSelectedLocation(toLocation);
    } catch (error) {
      if (requestId !== routeRequestRef.current) return;

      console.error("Preview route error:", error);
      setTrackingError("Unable to find a walking route. Please try again.");
    } finally {
      if (requestId === routeRequestRef.current) {
        setLoading(false);
      }
    }
  }, [fromId, toId, currentPosition, fromLocation, toLocation]);

  useEffect(() => {
    if (isWalking || startingWalk || gettingLocation) return;

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

  async function startWalking() {
    if (startingWalk || isWalking) return;

    if (!navigator.geolocation) {
      setTrackingError("Your browser does not support GPS tracking.");
      return;
    }

    if (!toLocation) {
      setTrackingError("Please select a destination.");
      return;
    }

    if (watchIdRef.current !== null) return;

    const requestId = ++routeRequestRef.current;
    const destination = { ...toLocation };

    setStartingWalk(true);
    setLoading(true);
    setTrackingError("");
    setRouteCoordinates([]);
    setRouteInfo(null);

    try {
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

      if (requestId !== routeRequestRef.current) return;

      const actualStartCoordinates = [
        position.coords.latitude,
        position.coords.longitude,
      ];

      setCurrentPosition(actualStartCoordinates);
      setFromId("current-location");
      setFromSearch("My Current Location");

      const destinationCoordinates = [
        destination.latitude,
        destination.longitude,
      ];

      const activeRoute = await fetchWalkingRoute(
        actualStartCoordinates,
        destinationCoordinates
      );

      if (requestId !== routeRequestRef.current) return;

      const activeRouteCoordinates = activeRoute.coordinates;
      const activeRouteInfo = activeRoute.info;

      if (!activeRouteCoordinates.length) {
        throw new Error("The routing service returned an empty route.");
      }

      setRouteCoordinates(activeRouteCoordinates);
      setRouteInfo(activeRouteInfo);
      setSelectedLocation(destination);

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

      setIsWalking(true);

      watchIdRef.current = navigator.geolocation.watchPosition(
        (gpsPosition) => {
          const latitude = gpsPosition.coords.latitude;
          const longitude = gpsPosition.coords.longitude;
          const accuracy = gpsPosition.coords.accuracy;

          const currentCoordinates = [latitude, longitude];

          setCurrentPosition(currentCoordinates);

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

            if (movedDistance >= 2 && movedDistance <= 100) {
              distanceRef.current += movedDistance;
              setWalkDistance(distanceRef.current);
            }
          }

          previousPositionRef.current = {
            latitude,
            longitude,
            accuracy,
          };

          const remaining = getRemainingRouteDistance(
            currentCoordinates,
            activeRouteCoordinates
          );

          if (remaining !== null) {
            setRemainingDistance(remaining);
          }

          const elapsedSeconds =
            (Date.now() - startedAtRef.current) / 1000;

          const plannedSpeed =
            (activeRouteInfo.distance * 1000) /
            activeRouteInfo.time;

          const actualSpeed =
            elapsedSeconds > 30 && distanceRef.current > 10
              ? distanceRef.current / elapsedSeconds
              : plannedSpeed;

          const estimatedSpeed = Math.max(actualSpeed, 0.5);

          const minutesRemaining =
            remaining !== null
              ? remaining / estimatedSpeed / 60
              : 0;

          setRemainingTime(minutesRemaining);
          setArrivalTime(Math.ceil(minutesRemaining));

          const distanceToDestination = calculateDistance(
            latitude,
            longitude,
            destination.latitude,
            destination.longitude
          );

          if (distanceToDestination <= 10) {
            arrivalReadingsRef.current++;
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
          let message = "GPS tracking stopped.";

          if (error.code === 1) {
            message = "Location permission was denied. Please allow location access.";
          } else if (error.code === 2) {
            message = "Your current GPS location is unavailable.";
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
        setTrackingError("Location permission was denied. Please allow location access.");
      } else if (error.code === 2) {
        setTrackingError("Unable to get your current GPS location. Please try again.");
      } else if (error.code === 3) {
        setTrackingError("GPS request timed out. Please try again.");
      } else {
        setTrackingError(
          error.message || "Unable to calculate a route from your current location."
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

  useEffect(() => {
    return () => {
      if (
        watchIdRef.current !== null &&
        navigator.geolocation
      ) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  return {
    isWalking,
    selectedLocation,
    setSelectedLocation,

    fromId,
    setFromId,

    toId,
    setToId,

    fromSearch,
    toSearch,
    setFromSearch,
    setToSearch,

    currentPosition,
    routeCoordinates,
    routeInfo,

    loading,
    gettingLocation,
    startingWalk,

    walkDistance,
    remainingDistance,
    remainingTime,
    arrivalTime,
    reachedDestination,
    trackingError,
    completedDuration,
    savedWalks,

    startingSuggestions,
    destinationSuggestions,

    selectStartingLocation,
    selectDestination,
    useMyLocation,
    startWalking,
    cancelWalking,
    formatArrivalTime,
  };
}
