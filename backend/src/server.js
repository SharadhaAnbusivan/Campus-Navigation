import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

dotenv.config();

// Credentials are supplied at runtime through
// GOOGLE_APPLICATION_CREDENTIALS or the hosting environment's default identity.
initializeApp({ credential: applicationDefault() });

const db = getFirestore();
const auth = getAuth();
const app = express();

app.use(cors({
  origin: (process.env.FRONTEND_URL || "http://localhost:5173")
    .split(",")
    .map((value) => value.trim()),
}));
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => {
  res.json({ status: "success", message: "Campus Trail API is running." });
});

async function verifyUser(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      return res.status(401).json({ status: "error", message: "Authentication required." });
    }
    const decoded = await auth.verifyIdToken(header.slice(7));
    req.user = {
      uid: decoded.uid,
      displayName: decoded.name || decoded.email?.split("@")[0] || "Campus student",
    };
    next();
  } catch (error) {
    console.error("Authentication error:", error.message);
    return res.status(401).json({ status: "error", message: "Invalid or expired login token." });
  }
}

function distanceMeters(a, b) {
  const rad = (n) => (n * Math.PI) / 180;
  const earthRadius = 6371000;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const lat1 = rad(a.latitude);
  const lat2 = rad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadius * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// Monday-based week ID using Asia/Kolkata calendar dates, e.g. 2026-11-02.
function getIstWeekId(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const utcDate = new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)));
  const weekday = utcDate.getUTCDay(); // Sunday = 0
  const daysSinceMonday = (weekday + 6) % 7;
  utcDate.setUTCDate(utcDate.getUTCDate() - daysSinceMonday);
  return `${utcDate.getUTCFullYear()}-${String(utcDate.getUTCMonth() + 1).padStart(2, "0")}-${String(utcDate.getUTCDate()).padStart(2, "0")}`;
}

app.post("/walking-sessions", verifyUser, async (req, res) => {
  try {
    const { requestId, trail } = req.body || {};

    if (
      typeof requestId !== "string" ||
      !/^[A-Za-z0-9_-]{16,80}$/.test(requestId) ||
      !Array.isArray(trail) ||
      trail.length < 2 ||
      trail.length > 10000
    ) {
      return res.status(400).json({ status: "error", message: "Invalid walking-session data." });
    }

    for (let i = 0; i < trail.length; i++) {
      const point = trail[i];
      if (
        !point ||
        !Number.isFinite(point.latitude) ||
        !Number.isFinite(point.longitude) ||
        !Number.isSafeInteger(point.timestamp) ||
        point.latitude < -90 || point.latitude > 90 ||
        point.longitude < -180 || point.longitude > 180
      ) {
        return res.status(400).json({ status: "error", message: "Invalid GPS point." });
      }
      if (i > 0 && point.timestamp <= trail[i - 1].timestamp) {
        return res.status(400).json({ status: "error", message: "GPS points must be chronological." });
      }
    }

    const startedAtMs = trail[0].timestamp;
    const finishedAtMs = Date.now(); // Server time, not a client-supplied finish time.
    if (
      startedAtMs > finishedAtMs + 30000 ||
      trail[trail.length - 1].timestamp > finishedAtMs + 30000 ||
      finishedAtMs - startedAtMs > 24 * 60 * 60 * 1000
    ) {
      return res.status(400).json({ status: "error", message: "Walk duration is outside the allowed range." });
    }

    let totalMeters = 0;
    for (let i = 1; i < trail.length; i++) {
      const previous = trail[i - 1];
      const current = trail[i];
      const seconds = (current.timestamp - previous.timestamp) / 1000;
      if (seconds <= 0 || seconds > 30) continue;

      const segment = distanceMeters(previous, current);
      const speed = segment / seconds;
      // Conservative filtering for GPS spikes and non-walking speeds.
      if (speed > 3.5 || segment < 2) continue;
      totalMeters += segment;
    }

    const distance = Math.round(totalMeters);
    if (distance < 10) {
      return res.status(400).json({ status: "error", message: "Not enough valid walking distance was recorded." });
    }

    const finishedAt = new Date(finishedAtMs);
    const startedAt = new Date(startedAtMs);
    const weekId = getIstWeekId(finishedAt);
    const sessionRef = db.collection("walkingSessions").doc(`${req.user.uid}_${requestId}`);
    const weeklyRef = db.collection("weeklyLeaderboards").doc(weekId)
      .collection("students").doc(req.user.uid);

    const result = await db.runTransaction(async (transaction) => {
      const existing = await transaction.get(sessionRef);
      if (existing.exists) {
        return { duplicate: true, savedDistanceMeters: existing.get("distanceMeters") };
      }

      const weeklySnapshot = await transaction.get(weeklyRef);
      const previousMeters = weeklySnapshot.exists
        ? Number(weeklySnapshot.get("totalDistanceMeters") || 0)
        : 0;
      const previousWalks = weeklySnapshot.exists
        ? Number(weeklySnapshot.get("totalWalks") || 0)
        : 0;

      transaction.create(sessionRef, {
        userId: req.user.uid,
        displayName: req.user.displayName,
        startedAt,
        finishedAt,
        createdAt: FieldValue.serverTimestamp(),
        distanceMeters: distance,
        distanceKm: Number((distance / 1000).toFixed(3)),
        durationSeconds: Math.max(0, Math.round((finishedAtMs - startedAtMs) / 1000)),
        trail,
        weekId,
        status: "recorded",
      });

      transaction.set(weeklyRef, {
        userId: req.user.uid,
        displayName: req.user.displayName,
        totalDistanceMeters: previousMeters + distance,
        totalWalks: previousWalks + 1,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      return { duplicate: false, savedDistanceMeters: distance };
    });

    return res.status(result.duplicate ? 200 : 201).json({
      status: "success",
      message: result.duplicate ? "This walk was already recorded." : "Walking session and weekly total saved.",
      duplicate: result.duplicate,
      sessionId: sessionRef.id,
      distanceMeters: result.savedDistanceMeters,
      distanceKm: Number((result.savedDistanceMeters / 1000).toFixed(3)),
      weekId,
    });
  } catch (error) {
    console.error("Walking-session error:", error);
    return res.status(500).json({ status: "error", message: "Unable to save the walking session." });
  }
});

const PORT = Number(process.env.PORT || 5000);
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Campus Trail API running on port ${PORT}`);
});