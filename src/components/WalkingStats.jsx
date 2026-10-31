export default function WalkingStats({
  currentStreak = 0,
  totalDistance = 0,
}) {
  return (
    <div className="walking-stats">
      <div className="walking-stats-header">
        <span className="walking-icon">🔥</span>
        <div>
          <h3>Walking Activity</h3>
          <p>Track your campus walking progress</p>
        </div>
      </div>

      <div className="walking-stat-grid">
        <div className="walking-stat-card">
          <span>Current Streak</span>
          <strong>{currentStreak}</strong>
          <small>days</small>
        </div>

        <div className="walking-stat-card">
          <span>Total Distance</span>
          <strong>{totalDistance.toFixed(2)}</strong>
          <small>km</small>
        </div>
      </div>
    </div>
  );
}