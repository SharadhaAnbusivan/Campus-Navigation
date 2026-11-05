
import { useEffect, useState } from "react";
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
} from "firebase/firestore";

import { db, auth } from "../firebase/firebase";

// Calculate Monday's date for the current week in Indian time.
function getCurrentWeekId() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = {};
  parts.forEach((part) => {
    values[part.type] = part.value;
  });

  const date = new Date(
    Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day)
    )
  );

  const day = date.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;

  date.setUTCDate(date.getUTCDate() - daysSinceMonday);

  return date.toISOString().slice(0, 10);
}

export default function Leaderboard() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const weekId = getCurrentWeekId();

  useEffect(() => {
    if (!auth.currentUser) {
      setLoading(false);
      return;
    }

    const leaderboardRef = collection(
      db,
      "weeklyLeaderboards",
      weekId,
      "students"
    );

    const leaderboardQuery = query(
      leaderboardRef,
      orderBy("totalDistanceMeters", "desc"),
      limit(100)
    );

    const unsubscribe = onSnapshot(
      leaderboardQuery,
      (snapshot) => {
        const data = snapshot.docs.map((document) => ({
          id: document.id,
          ...document.data(),
        }));

        setStudents(data);
        setLoading(false);
        setError("");
      },
      (err) => {
        console.error("Leaderboard error:", err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [weekId]);

  return (
    <section className="leaderboard-card">
      <div className="leaderboard-heading">
        <div>
          <h2>🏆 Weekly Leaderboard</h2>
          <p>Week starting {weekId}</p>
        </div>
      </div>

      {loading && <p>Loading leaderboard...</p>}

      {error && <p className="leaderboard-error">{error}</p>}

      {!loading && !error && students.length === 0 && (
        <p>No walks recorded this week yet.</p>
      )}

      {!loading && !error && students.length > 0 && (
        <div className="leaderboard-list">
          {students.map((student, index) => {
            const isCurrentUser =
              student.id === auth.currentUser?.uid;

            return (
              <div
                className={`leaderboard-row ${
                  isCurrentUser ? "current-user" : ""
                }`}
                key={student.id}
              >
                <span className="leaderboard-rank">
                  {index === 0
                    ? "🥇"
                    : index === 1
                    ? "🥈"
                    : index === 2
                    ? "🥉"
                    : `#${index + 1}`}
                </span>

                <div className="leaderboard-student">
                  <strong>
                    {student.displayName || "Student"}
                    {isCurrentUser && " (You)"}
                  </strong>
                  <small>
                    {student.totalWalks || 0} walks
                  </small>
                </div>

                <strong className="leaderboard-distance">
                  {(
                    (student.totalDistanceMeters || 0) / 1000
                  ).toFixed(2)}{" "}
                  km
                </strong>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
