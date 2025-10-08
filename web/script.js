// Firebase imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-functions.js";

// 🔧 Replace this with your Firebase config
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  appId: "YOUR_APP_ID",
};

// Init
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const functions = getFunctions(app);

const loginBtn = document.getElementById("login-btn");
const email = document.getElementById("email");
const password = document.getElementById("password");
const loginStatus = document.getElementById("login-status");
const voteSection = document.getElementById("vote-section");
const tokenInput = document.getElementById("token");
const candidateSelect = document.getElementById("candidate");
const submitVoteBtn = document.getElementById("submit-vote-btn");
const voteStatus = document.getElementById("vote-status");

loginBtn.onclick = async () => {
  try {
    await signInWithEmailAndPassword(auth, email.value, password.value);
    loginStatus.textContent = "✅ Logged in successfully.";
  } catch (err) {
    loginStatus.textContent = "❌ " + err.message;
  }
};

onAuthStateChanged(auth, (user) => {
  if (user) {
    document.getElementById("auth-section").classList.add("hidden");
    voteSection.classList.remove("hidden");
  } else {
    document.getElementById("auth-section").classList.remove("hidden");
    voteSection.classList.add("hidden");
  }
});

submitVoteBtn.onclick = async () => {
  const submitVote = httpsCallable(functions, "submitVote");
  try {
    const result = await submitVote({
      electionId: "default-election",
      tokenId: tokenInput.value,
      candidateId: candidateSelect.value,
    });
    if (result.data.ok) {
      voteStatus.textContent = "✅ Vote submitted successfully!";
    } else {
      voteStatus.textContent = "❌ Vote failed.";
    }
  } catch (err) {
    voteStatus.textContent = "❌ " + err.message;
  }
};
