import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

import serviceAccount from "../ServiceAccountKey.json" with { type: "json" };

dotenv.config();

// Initialize Firebase Admin
initializeApp({
  credential: cert(serviceAccount),
});

// Connect to Firebase services
const db = getFirestore();
const auth = getAuth();

// Create Express server
const app = express();

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
  })
);

app.use(express.json({ limit: "2mb" }));

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "success",
    message: "Campus Trail API is running!",
    firebase: "initialized",
  });
});

// Test Firestore connection
app.get("/test-firestore", async (req, res) => {
  try {
    const testRef = await db.collection("connectionTests").add({
      message: "Campus Trail Firestore connection successful!",
      createdAt: new Date(),
    });

    res.json({
      status: "success",
      message: "Firestore write successful!",
      documentId: testRef.id,
    });
  } catch (error) {
    console.error("Firestore error:", error);

    res.status(500).json({
      status: "error",
      message: "Firestore write failed.",
    });
  }
});

// Verify Firebase Authentication for protected routes
async function verifyUser(req, res, next) {
  try {
    const authorization = req.headers.authorization;

    if (!authorization?.startsWith("Bearer ")) {
      return res.status(401).json({
        status: "error",
        message: "Authentication required.",
      });
    }

    const idToken = authorization.slice("Bearer ".length);
    const decodedToken = await auth.verifyIdToken(idToken);

    req.user = {
      uid: decodedToken.uid,
    };

    next();
  } catch (error) {
    console.error("Authentication error:", error.message);

    return res.status(401).json({
      status: "error",
      message: "Invalid or expired authentication token.",
    });
  }
}

// Calculate distance between two GPS points in metres
function calculateDistance(pointA, pointB) {
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const earthRadius = 6371000;

  const lat1 = toRadians(pointA.latitude);
  const lat2 = toRadians(pointB.latitude);
  const deltaLat = toRadians(pointB.latitude - pointA.latitude);
  const deltaLon = toRadians(pointB.longitude - pointA.longitude);

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(deltaLon / 2) ** 2;

  return (
    earthRadius *
    2 *
    Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  );
}

// Save a completed walking session
app.post("/walking-sessions", verifyUser, async (req, res) => {
  try {
    const { startedAt, finishedAt, trail } = req.body;

    if (
      !Number.isSafeInteger(startedAt) ||
      !Number.isSafeInteger(finishedAt) ||
      !Array.isArray(trail)
    ) {
      return res.status(400).json({
        status: "error",
        message: "Invalid walking-session data.",
      });
    }

    if (
      finishedAt <= startedAt ||
      finishedAt > Date.now() + 30000 ||
      finishedAt - startedAt > 24 * 60 * 60 * 1000
    ) {
      return res.status(400).json({
        status: "error",
        message: "Invalid walking-session timestamps.",
      });
    }

    if (trail.length < 2 || trail.length > 10000) {
      return res.status(400).json({
        status: "error",
        message: "The GPS trail must contain between 2 and 10000 points.",
      });
    }

    // Validate every GPS point
    for (const point of trail) {
      if (
        !point ||
        !Number.isFinite(point.latitude) ||
        !Number.isFinite(point.longitude) ||
        !Number.isSafeInteger(point.timestamp) ||
        point.latitude < -90 ||
        point.latitude > 90 ||
        point.longitude < -180 ||
        point.longitude > 180 ||
        point.timestamp < startedAt ||
        point.timestamp > finishedAt
      ) {
        return res.status(400).json({
          status: "error",
          message: "Invalid GPS coordinates or timestamps.",
        });
      }
    }

    // Require GPS points in chronological order.
    for (let i = 1; i < trail.length; i++) {
      if (trail[i].timestamp <= trail[i - 1].timestamp) {
        return res.status(400).json({
          status: "error",
          message: "GPS timestamps must be strictly increasing.",
        });
      }
    }

    let distanceMeters = 0;

    for (let i = 1; i < trail.length; i++) {
      const previous = trail[i - 1];
      const current = trail[i];

      const elapsedSeconds =
        (current.timestamp - previous.timestamp) / 1000;

      // Do not count gaps where the travelled path is unknown.
      if (elapsedSeconds > 30) {
        continue;
      }

      const segmentDistance = calculateDistance(previous, current);
      const speed = segmentDistance / elapsedSeconds;

      // Ignore implausible GPS jumps.
      if (speed > 3.5) {
        continue;
      }

      // Ignore tiny movements that are likely GPS noise.
      if (segmentDistance < 2) {
        continue;
      }

      distanceMeters += segmentDistance;
    }

    if (distanceMeters <= 0) {
      return res.status(400).json({
        status: "error",
        message: "No valid walking distance could be calculated.",
      });
    }

    const sessionRef = await db.collection("walkingSessions").add({
      userId: req.user.uid,
      startedAt: new Date(startedAt),
      finishedAt: new Date(finishedAt),
      createdAt: new Date(),
      distanceMeters: Math.round(distanceMeters),
      distanceKm: Number((distanceMeters / 1000).toFixed(3)),
      durationSeconds: Math.round((finishedAt - startedAt) / 1000),
      status: "recorded",
    });

    return res.status(201).json({
      status: "success",
      message: "Walking session saved.",
      sessionId: sessionRef.id,
      distanceMeters: Math.round(distanceMeters),
      distanceKm: Number((distanceMeters / 1000).toFixed(3)),
    });
  } catch (error) {
    console.error("Walking-session error:", error);

    return res.status(500).json({
      status: "error",
      message: "Unable to save the walking session.",
    });
  }
});

// Start server
const PORT = process.env.PORT || 5000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Campus Trail API running on port ${PORT}`);
});