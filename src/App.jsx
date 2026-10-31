
import CampusMap from "./components/CampusMap";
import RouteControls from "./components/RouteControls";
import LocationDetails from "./components/LocationDetails";
import useCampusNavigation from "./hooks/useCampusNavigation";

import locations from "./data/locations.json";

import "./index.css";
import "./App.css";

export default function App() {
  const navigation = useCampusNavigation();

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
            <h2>Explore Campus</h2>
          </div>

          <RouteControls
            {...navigation}
          />

          <div className="map-container">
            <CampusMap
              locations={locations}
              selectedLocation={navigation.selectedLocation}
              onSelectLocation={navigation.setSelectedLocation}
              routeCoordinates={navigation.routeCoordinates}
              currentPosition={navigation.currentPosition}
            />
          </div>
        </section>

        <LocationDetails
          {...navigation}
        />
      </main>
    </div>
  );
}