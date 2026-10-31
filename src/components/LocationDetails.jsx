
export default function LocationDetails({
  selectedLocation,
  routeInfo,
  isWalking,
  reachedDestination,
  walkDistance,
  remainingDistance,
  remainingTime,
  completedDuration,
  savedWalks,
  startingWalk,
  loading,
  startWalking,
  cancelWalking,
  formatArrivalTime,
}) {
  return (
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
          <p>Select a campus marker to see its details.</p>
        </div>
      )}

      <div className="saved-walk-count">
        <p>
          <strong>Saved walks:</strong> {savedWalks.length}
        </p>
      </div>
    </aside>
  );
}
