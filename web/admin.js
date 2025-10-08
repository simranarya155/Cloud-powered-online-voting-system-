import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-functions.js";

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  appId: "YOUR_APP_ID",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const functions = getFunctions(app);

const loginBtn = document.getElementById("login-btn");
const email = document.getElementById("email");
const password = document.getElementById("password");
const loginStatus = document.getElementById("login-status");
const tokenSection = document.getElementById("token-section");
const uidInput = document.getElementById("uid");
const electionInput = document.getElementById("electionId");
const issueTokenBtn = document.getElementById("issue-token-btn");
const tokenOutput = document.getElementById("token-output");

loginBtn.onclick = async () => {
  try {
    await signInWithEmailAndPassword(auth, email.value, password.value);
    loginStatus.textContent = "✅ Logged in as Admin.";
  } catch (err) {
    loginStatus.textContent = "❌ " + err.message;
  }
};

onAuthStateChanged(auth, (user) => {
  if (user) {
    document.getElementById("login-btn").classList.add("hidden");
    tokenSection.classList.remove("hidden");
  } else {
    tokenSection.classList.add("hidden");
  }
});

issueTokenBtn.onclick = async () => {
  const issueToken = httpsCallable(functions, "issueVoteToken");
  try {
    const result = await issueToken({
      targetUid: uidInput.value,
      electionId: electionInput.value,
      ttlSeconds: 3600,
    });
    tokenOutput.textContent = `✅ Token ID: ${result.data.tokenId}`;
  } catch (err) {
    tokenOutput.textContent = "❌ " + err.message;
  }
};
