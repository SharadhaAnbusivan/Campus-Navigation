
import { useEffect, useRef, useState } from "react";

const toRadians = (degrees) => (degrees * Math.PI) / 180;

function calculateDistance(a, b) {
  const earthRadius = 6371000;

  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const deltaLat = toRadians(b.latitude - a.latitude);
  const deltaLon = toRadians(b.longitude - a.longitude);

  const value =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(deltaLon / 2) ** 2;

  return (
    earthRadius *
    2 *
    Math.atan2(Math.sqrt(value), Math.sqrt(1 - value))
  );
}

function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  return [hours, minutes, secs]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

export default function WalkingTracker({
  routeActive = false,
  destination = null,
  onPositionUpdate,
  onTrailUpdate,
  onSessionFinish,
  onTripCompleted,
}) {
  const [status, setStatus] = useState("idle");
  const [distance, setDistance] = useState(0);
  const [duration, setDuration] = useState(0);
  const [gpsAccuracy, setGpsAccuracy] = useState(null);
  const [error, setError] = useState("");

  const watchId = useRef(null);
  const statusRef = useRef("idle");

  const lastPosition = useRef(null);
  const baselinePosition = useRef(null);

  const distanceRef = useRef(0);
  const trailRef = useRef([]);

  const startedAt = useRef(null);
  const activeSeconds = useRef(0);
  const activePeriodStartedAt = useRef(null);

  const requestId = useRef(null);

  const movementDetected = useRef(false);
  const arrivalReadings = useRef(0);
  const completedRef = useRef(false);

  const destinationRef = useRef(destination);

  const callbacksRef = useRef({
    onPositionUpdate,
    onTrailUpdate,
    onSessionFinish,
    onTripCompleted,
  });

  useEffect(() => {
    destinationRef.current = destination;
  }, [destination]);

  useEffect(() => {
    callbacksRef.current = {
      onPositionUpdate,
      onTrailUpdate,
      onSessionFinish,
      onTripCompleted,
    };
  }, [
    onPositionUpdate,
    onTrailUpdate,
    onSessionFinish,
    onTripCompleted,
  ]);

  function changeStatus(nextStatus) {
    statusRef.current = nextStatus;
    setStatus(nextStatus);
  }

  function stopGPS() {
    if (watchId.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
  }

  function resetSession() {
    stopGPS();

    distanceRef.current = 0;
    trailRef.current = [];

    lastPosition.current = null;
    baselinePosition.current = null;

    startedAt.current = null;
    activeSeconds.current = 0;
    activePeriodStartedAt.current = null;

    requestId.current = null;

    movementDetected.current = false;
    arrivalReadings.current = 0;
    completedRef.current = false;

    setDistance(0);
    setDuration(0);
    setGpsAccuracy(null);
    setError("");

    callbacksRef.current.onTrailUpdate?.([]);
  }

  function finishTracking(completedByArrival = false) {
    if (
      statusRef.current !== "tracking" &&
      statusRef.current !== "paused"
    ) {
      return;
    }

    if (completedRef.current) return;

    stopGPS();

    if (activePeriodStartedAt.current !== null) {
      activeSeconds.current += Math.floor(
        (Date.now() - activePeriodStartedAt.current) / 1000
      );

      activePeriodStartedAt.current = null;
    }

    const finishedAt = Date.now();

    setDuration(activeSeconds.current);
    changeStatus("finished");

    completedRef.current = true;

    const session = {
      requestId: requestId.current,
      startedAt: startedAt.current,
      finishedAt,
      distanceMeters: distanceRef.current,
      durationSeconds: activeSeconds.current,
      trail: trailRef.current,
      completedByArrival,
    };

    callbacksRef.current.onSessionFinish?.(session);

    if (completedByArrival) {
      callbacksRef.current.onTripCompleted?.();
    }
  }

  function startGPS() {
    if (!navigator.geolocation) {
      setError("Your browser does not support GPS location.");
      return;
    }

    stopGPS();
    setError("");

    watchId.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;

        const point = {
          latitude,
          longitude,
          timestamp: position.timestamp || Date.now(),
        };

        setGpsAccuracy(accuracy);

        callbacksRef.current.onPositionUpdate?.([
          latitude,
          longitude,
        ]);

        if (accuracy > 75) return;

        const currentDestination = destinationRef.current;

        if (
          movementDetected.current &&
          currentDestination &&
          typeof currentDestination.latitude === "number" &&
          typeof currentDestination.longitude === "number"
        ) {
          const remainingDistance = calculateDistance(point, {
            latitude: currentDestination.latitude,
            longitude: currentDestination.longitude,
          });

          if (remainingDistance <= 30 && accuracy <= 75) {
            arrivalReadings.current += 1;
          } else {
            arrivalReadings.current = 0;
          }

          if (arrivalReadings.current >= 2) {
            finishTracking(true);
            return;
          }
        }

        if (!movementDetected.current) {
          if (!baselinePosition.current) {
            baselinePosition.current = point;
            lastPosition.current = point;
            return;
          }

          const movement = calculateDistance(
            baselinePosition.current,
            point
          );

          if (movement < 3) return;

          movementDetected.current = true;

          // Use the baseline timestamp so the first trail point
          // is not earlier than the session start.
          startedAt.current = baselinePosition.current.timestamp;

          // One ID per walk, retained until the next reset.
          requestId.current = crypto.randomUUID();

          activePeriodStartedAt.current = Date.now();

          changeStatus("tracking");

          const initialTrail = [
            baselinePosition.current,
            point,
          ];

          trailRef.current = initialTrail;

          callbacksRef.current.onTrailUpdate?.(
            initialTrail.map((item) => [
              item.latitude,
              item.longitude,
            ])
          );

          lastPosition.current = point;
          return;
        }

        const previous = lastPosition.current;

        if (previous) {
          const segmentDistance = calculateDistance(
            previous,
            point
          );

          const elapsedSeconds =
            (point.timestamp - previous.timestamp) / 1000;

          const speed =
            elapsedSeconds > 0
              ? segmentDistance / elapsedSeconds
              : Infinity;

          if (
            elapsedSeconds <= 0 ||
            elapsedSeconds > 45 ||
            speed > 4.5
          ) {
            lastPosition.current = point;
            return;
          }

          if (segmentDistance < 1.5) {
            return;
          }

          distanceRef.current += segmentDistance;
          setDistance(distanceRef.current);
        }

        lastPosition.current = point;

        const updatedTrail = [
          ...trailRef.current,
          point,
        ];

        trailRef.current = updatedTrail;

        callbacksRef.current.onTrailUpdate?.(
          updatedTrail.map((item) => [
            item.latitude,
            item.longitude,
          ])
        );
      },
      (gpsError) => {
        const messages = {
          1: "Location permission denied. Please allow location access.",
          2: "GPS location is unavailable. Try moving outdoors.",
          3: "GPS request timed out. Waiting for another reading.",
        };

        setError(
          messages[gpsError.code] ||
            "Unable to get GPS location."
        );
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 20000,
      }
    );
  }

  function pauseTracking() {
    if (activePeriodStartedAt.current !== null) {
      activeSeconds.current += Math.floor(
        (Date.now() - activePeriodStartedAt.current) / 1000
      );

      activePeriodStartedAt.current = null;
    }

    stopGPS();

    lastPosition.current = null;

    setDuration(activeSeconds.current);
    changeStatus("paused");
  }

  function resumeTracking() {
    lastPosition.current = null;
    activePeriodStartedAt.current = Date.now();

    changeStatus("tracking");
    startGPS();
  }

  useEffect(() => {
    if (!routeActive) {
      if (
        statusRef.current === "armed" ||
        statusRef.current === "tracking"
      ) {
        resetSession();
        changeStatus("idle");
      }

      return;
    }

    if (statusRef.current !== "idle") return;

    resetSession();
    changeStatus("armed");
    startGPS();

    return () => {
      stopGPS();
    };
  }, [routeActive]);

  useEffect(() => {
    if (status !== "tracking") return;

    const timer = setInterval(() => {
      const currentPeriodSeconds =
        activePeriodStartedAt.current === null
          ? 0
          : Math.floor(
              (Date.now() - activePeriodStartedAt.current) / 1000
            );

      setDuration(
        activeSeconds.current + currentPeriodSeconds
      );
    }, 1000);

    return () => clearInterval(timer);
  }, [status]);

  useEffect(() => {
    return () => stopGPS();
  }, []);

  const distanceKm = (distance / 1000).toFixed(2);

  return (
    <section className="walking-tracker">
      <div className="tracker-heading">
        <div>
          <span className="tracker-eyebrow">YOUR WALK</span>

          <h2>Walking tracker</h2>

          <p>Every step adds to your campus journey.</p>
        </div>

        <span className={`tracker-status ${status}`}>
          <span className="status-dot" />

          {status === "idle" && "Ready"}
          {status === "armed" && "Waiting for movement"}
          {status === "tracking" && "Recording"}
          {status === "paused" && "Paused"}
          {status === "finished" && "Completed"}
        </span>
      </div>

      <div className="tracker-stats">
        <div className="tracker-distance">
          <span>Distance walked</span>

          <strong>{distanceKm}</strong>

          <small>kilometres</small>
        </div>

        <div className="tracker-time">
          <span>Duration</span>

          <strong>{formatDuration(duration)}</strong>

          <small>hh : mm : ss</small>
        </div>
      </div>

      <div className="tracker-gps">
        <span className="gps-icon">◎</span>

        <div>
          <strong>
            {status === "armed"
              ? "GPS ready - start walking"
              : status === "tracking"
                ? "GPS connected"
                : status === "paused"
                  ? "GPS paused"
                  : status === "finished"
                    ? "Walk completed"
                    : "GPS standing by"}
          </strong>

          <small>
            {gpsAccuracy !== null
              ? `Accuracy approximately ${Math.round(
                  gpsAccuracy
                )} metres`
              : "Location access is required to record your walk"}
          </small>
        </div>
      </div>

      {error && (
        <p className="tracker-error">{error}</p>
      )}

      <div className="tracker-actions">
        {status === "idle" && (
          <p>
            Choose a destination and show a walking route to begin.
          </p>
        )}

        {status === "armed" && (
          <p>
            Start moving. Your walk will be recorded automatically.
          </p>
        )}

        {status === "tracking" && (
          <>
            <button
              className="tracker-primary"
              onClick={pauseTracking}
            >
              Pause walk
            </button>

            <button
              className="tracker-secondary"
              onClick={() => finishTracking(false)}
            >
              Finish
            </button>
          </>
        )}

        {status === "paused" && (
          <>
            <button
              className="tracker-primary"
              onClick={resumeTracking}
            >
              Resume walk
            </button>

            <button
              className="tracker-secondary"
              onClick={() => finishTracking(false)}
            >
              Finish
            </button>
          </>
        )}

        {status === "finished" && (
          <button
            className="tracker-primary"
            onClick={() => {
              resetSession();
              changeStatus("idle");
            }}
          >
            Start a new walk
          </button>
        )}
      </div>

      {status === "finished" && (
        <p className="tracker-complete">
          {completedRef.current
            ? "🎉 Location reached! Trip completed!"
            : `Walk completed! Your recorded distance is ${distanceKm} km.`}
        </p>
      )}
    </section>
  );
}
