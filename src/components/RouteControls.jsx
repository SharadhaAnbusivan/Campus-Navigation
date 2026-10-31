
export default function RouteControls({
  fromSearch,
  toSearch,
  setFromSearch,
  setToSearch,
  fromId,
  setFromId,
  toId,
  setToId,
  startingSuggestions = [],
  destinationSuggestions = [],
  selectStartingLocation,
  selectDestination,
  useMyLocation,
  gettingLocation,
  startingWalk,
  isWalking,
  loading,
  trackingError,
  cancelWalking,
}) {
  function handleLocationChange(type, value) {
    // End the active walk before changing either location
    if (isWalking) {
      cancelWalking();
    }

    if (type === "from") {
      setFromId("");
      setFromSearch(value);
    } else {
      setToId("");
      setToSearch(value);
    }
  }

  return (
    <div className="route-controls">
      {/* FROM */}
      <div className="route-field">
        <label htmlFor="from-location-input">From</label>

        <div className="location-input-wrapper">
          <input
            id="from-location-input"
            type="text"
            placeholder="Type starting location..."
            value={fromSearch}
            autoComplete="off"
            onChange={(event) =>
              handleLocationChange("from", event.target.value)
            }
          />

          <button
            type="button"
            className="current-location-button"
            onClick={useMyLocation}
            title="Use my current location"
            aria-label="Use my current location"
            disabled={gettingLocation || startingWalk || isWalking}
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
              {startingSuggestions.length > 0 ? (
                startingSuggestions.map((location) => (
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
                ))
              ) : (
                <p className="no-suggestions">
                  No matching locations found
                </p>
              )}
            </div>
          )}
      </div>

      {/* TO */}
      <div className="route-field">
        <label htmlFor="to-location-input">To</label>

        <div className="location-input-wrapper">
          <input
            id="to-location-input"
            type="text"
            placeholder="Type destination..."
            value={toSearch}
            autoComplete="off"
            onChange={(event) =>
              handleLocationChange("to", event.target.value)
            }
          />
        </div>

        {toSearch.trim() && !toId && (
          <div className="location-suggestions">
            {destinationSuggestions.length > 0 ? (
              destinationSuggestions.map((location) => (
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
              ))
            ) : (
              <p className="no-suggestions">
                No matching locations found
              </p>
            )}
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
        <p className="route-status">{trackingError}</p>
      )}
    </div>
  );
}
