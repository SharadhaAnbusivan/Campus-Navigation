
import { useState } from "react";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile
} from "firebase/auth";

import { auth } from "../firebase/firebase";
import "./Login.css";

function Login() {
  const [isSignup, setIsSignup] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");

    try {
      if (isSignup) {
        const result = await createUserWithEmailAndPassword(
          auth,
          email,
          password
        );

        await updateProfile(result.user, {
          displayName: name
        });

        setMessage("Account created successfully!");
      } else {
        await signInWithEmailAndPassword(auth, email, password);
        setMessage("Login successful!");
      }
    } catch (error) {
      setMessage(error.message);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1>Campus Trail</h1>
        <p className="subtitle">Your campus, your community.</p>

        <h2>{isSignup ? "Create an account" : "Welcome back!"}</h2>

        <form onSubmit={handleSubmit}>
          {isSignup && (
            <input
              type="text"
              placeholder="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          )}

          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <input
            type="password"
            placeholder="Password (minimum 6 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />

          <button type="submit">
            {isSignup ? "Sign Up" : "Log In"}
          </button>
        </form>

        {message && <p className="auth-message">{message}</p>}

        <p className="switch-auth">
          {isSignup ? "Already have an account?" : "Don't have an account?"}
          <span onClick={() => {
            setIsSignup(!isSignup);
            setMessage("");
          }}>
            {isSignup ? " Log in" : " Sign up"}
          </span>
        </p>
      </div>
    </div>
  );
}

export default Login;
