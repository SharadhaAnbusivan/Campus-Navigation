import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDTYfJV_mzxwbnZljJ3sZTac8GglDZqnXY",
  authDomain: "campus-navigation-5fc77.firebaseapp.com",
  projectId: "campus-navigation-5fc77",
  storageBucket: "campus-navigation-5fc77.firebasestorage.app",
  messagingSenderId: "18522309075",
  appId: "1:18522309075:web:243857dd1d8bdafb142f26",
  measurementId: "G-W0BKFK0K8T"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

export default app;